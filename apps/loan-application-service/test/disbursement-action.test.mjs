import "reflect-metadata";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Test } from "@nestjs/testing";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { AppModule } from "../dist/app.module.js";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { DisbursementActionService } from "../dist/modules/disbursement/disbursement-action.service.js";
import { RepaymentLoanClient } from "../dist/modules/disbursement/repayment-loan.client.js";
import { SimulatedTransferProvider } from "../dist/modules/disbursement/simulated-transfer.provider.js";
import { PrismaService } from "../dist/modules/prisma/prisma.service.js";
import { LoanProductClient } from "../dist/modules/loan-applications/loan-product.client.js";
import { contractContentHash } from "../dist/modules/submission/contract-content.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repaymentUrl = process.env.REPAYMENT_TEST_DATABASE_URL;

test(
  "disbursement durably resumes across transfer and repayment failures",
  {
    skip: (!databaseUrl || !repaymentUrl) && "Requires two disposable local *_test databases",
    timeout: 60000,
  },
  async (t) => {
    for (const value of [databaseUrl, repaymentUrl]) {
      const target = new URL(value);

      assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
      assert.ok(target.pathname.endsWith("_test"));
    }

    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const repayment = new pg.Client({ connectionString: repaymentUrl });
    const secret = randomBytes(32).toString("hex");
    const internalToken = randomBytes(32).toString("hex");
    const keys = ["JWT_SECRET", "REPAYMENT_SERVICE_URL", "REPAYMENT_INTERNAL_TOKEN"];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const applicationIds = [];
    const runtime = await mkdtemp(join(tmpdir(), "loan-disbursement-test-"));
    const calls = [];
    let transferFailure = false;
    let proxyMode = "normal";
    let proxy;
    let child;
    let exited;
    let app;

    const transfer = {
      async transfer(input) {
        calls.push(input);

        return transferFailure
          ? { status: "FAILED", processedAt: new Date("2026-01-31T12:00:00Z") }
          : {
              status: "SUCCEEDED",
              transactionReference: `SIM-${input.disbursementId}-${input.attemptNumber}`,
              processedAt: new Date("2026-01-31T12:00:00Z"),
            };
      },
    };

    function cookie(role = "STAFF", sub = randomUUID()) {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub,
          role,
          tokenType: "access",
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString("base64url");
      const unsigned = `${header}.${payload}`;

      return `access_token=${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
    }

    async function seed(overrides = {}) {
      const application = await prisma.loanApplication.create({
        data: {
          applicationNumber: randomUUID(),
          customerId: randomUUID(),
          productId: randomUUID(),
          status: "APPROVED",
          requestedAmount: 101n,
          termMonths: 2,
          purpose: "Test",
          accountNumber: "mutated-account",
          accountHolderName: "MUTATED",
          ...overrides,
        },
      });
      applicationIds.push(application.id);
      const contract = await prisma.loanContract.create({
        data: {
          applicationId: application.id,
          contractNumber: randomUUID(),
          version: 1,
          status: "CUSTOMER_SIGNED",
          principalAmount: 101n,
          termMonths: 2,
          annualInterestRate: "6",
          totalInterest: 3n,
          totalPayable: 104n,
          applicationSnapshot: {
            customerId: application.customerId,
            disbursementAccount: {
              accountNumber: "1234567890",
              accountHolderName: "FROZEN BORROWER",
              verificationStatus: "VERIFIED",
            },
          },
          productSnapshot: {},
          schedulePreview: [
            { installmentNumber: 1, principalAmount: 50, interestAmount: 2, totalAmount: 52 },
            { installmentNumber: 2, principalAmount: 51, interestAmount: 1, totalAmount: 52 },
          ],
          signedAt: new Date(),
          contentHash: "test-only-pending-hash",
        },
      });

      await prisma.loanContract.update({
        where: { id: contract.id },
        data: { contentHash: contractContentHash(contract) },
      });

      return { application, contract };
    }

    try {
      await repayment.connect();
      const portServer = createServer();

      portServer.listen(0, "127.0.0.1");
      await once(portServer, "listening");
      const port = portServer.address().port;

      await new Promise((resolve) => portServer.close(resolve));
      child = spawn(
        process.execPath,
        [fileURLToPath(new URL("../../repayment-service/dist/main.js", import.meta.url))],
        {
          cwd: runtime,
          env: {
            PATH: process.env.PATH,
            DATABASE_URL: repaymentUrl,
            JWT_SECRET: secret,
            REPAYMENT_INTERNAL_TOKEN: internalToken,
            HOST: "127.0.0.1",
            PORT: String(port),
          },
          stdio: "ignore",
        },
      );
      exited = once(child, "exit");
      void exited.catch(() => {});
      const repaymentBase = `http://127.0.0.1:${port}`;
      let healthy = false;

      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          healthy = (await fetch(`${repaymentBase}/api/v1/health`)).ok;
        } catch {
          await delay(50);
        }

        if (healthy) {
          break;
        }
      }

      assert.ok(healthy, "Disposable repayment process must become healthy");
      proxy = createServer(async (request, response) => {
        try {
          if (proxyMode === "unavailable") {
            response.writeHead(503).end();
            return;
          }

          const chunks = [];

          for await (const chunk of request) {
            chunks.push(chunk);
          }

          const upstream = await fetch(`${repaymentBase}${request.url}`, {
            method: request.method,
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Service-Token": internalToken,
            },
            body: request.method === "GET" ? undefined : Buffer.concat(chunks),
          });
          const body = await upstream.text();

          if (proxyMode === "lost-ack") {
            request.socket.destroy();
            return;
          }

          response.writeHead(upstream.status, { "Content-Type": "application/json" }).end(body);
        } catch {
          response.writeHead(503).end();
        }
      });
      proxy.listen(0, "127.0.0.1");
      await once(proxy, "listening");
      process.env.JWT_SECRET = secret;
      process.env.REPAYMENT_INTERNAL_TOKEN = internalToken;
      process.env.REPAYMENT_SERVICE_URL = `http://127.0.0.1:${proxy.address().port}`;
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(SimulatedTransferProvider)
        .useValue(transfer)
        .overrideProvider(LoanProductClient)
        .useValue({
          async getById(id) {
            return {
              id,
              status: "ACTIVE",
              minAmount: 1,
              maxAmount: 1000,
              allowedTerms: [2],
              requiredDocumentTypes: [],
            };
          },
        })
        .compile();

      app = module.createNestApplication({ logger: false });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl();

      async function post(id, key = randomUUID(), auth = cookie(), body) {
        const headers = { Cookie: auth, "Content-Type": "application/json" };

        if (key !== null) {
          headers["Idempotency-Key"] = key;
        }

        const response = await fetch(`${base}/api/v1/staff/loan-applications/${id}/disbursement`, {
          method: "POST",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        return { status: response.status, body: await response.json() };
      }

      await t.test("staff, approval, signing and idempotency headers are required", async () => {
        const { application, contract } = await seed({ status: "SUBMITTED" });

        assert.equal((await post(application.id, randomUUID(), "")).status, 401);
        assert.equal(
          (await post(application.id, randomUUID(), cookie("CUSTOMER", application.customerId)))
            .status,
          403,
        );
        assert.equal((await post(application.id, null)).status, 400);
        assert.equal((await post(application.id, "bad key")).status, 400);
        assert.equal(
          (await post(application.id, randomUUID(), cookie(), { outcome: "SUCCEEDED" })).status,
          400,
        );
        assert.equal((await post(application.id)).status, 409);
        await prisma.loanApplication.update({
          where: { id: application.id },
          data: { status: "APPROVED" },
        });
        await prisma.loanContract.update({ where: { id: contract.id }, data: { status: "DRAFT" } });
        assert.equal((await post(application.id)).status, 409);
        assert.equal(
          await prisma.disbursement.count({ where: { applicationId: application.id } }),
          0,
        );
      });

      await t.test(
        "concurrent actions use frozen account and schedule and perform one transfer",
        async () => {
          const { application } = await seed();
          const key = randomUUID();
          const before = calls.length;
          const results = await Promise.all([
            post(application.id, key),
            post(application.id, key),
            post(application.id),
          ]);

          assert.ok(
            results.every((result) => result.status === 200 && result.body.status === "SUCCEEDED"),
          );
          assert.equal(new Set(results.map((result) => result.body.loanId)).size, 1);
          assert.equal(calls.length, before + 1);
          assert.equal(calls.at(-1).accountNumber, "1234567890");
          assert.equal(calls.at(-1).accountHolderName, "FROZEN BORROWER");
          const response = await fetch(
            `${repaymentBase}/api/v1/loans/${results[0].body.loanId}/repayment-schedule`,
            { headers: { Cookie: cookie("CUSTOMER", application.customerId) } },
          );
          const schedule = await response.json();

          assert.equal(response.status, 200);
          assert.deepEqual(
            schedule.items.map((item) => [item.dueDate, item.totalAmount]),
            [
              ["2026-02-28", 52],
              ["2026-03-31", 52],
            ],
          );
          assert.deepEqual((await post(application.id, key)).body, results[0].body);
        },
      );

      await t.test("failed simulation is durable and a new key explicitly retries it", async () => {
        const { application } = await seed();
        const key = randomUUID();
        const before = calls.length;
        transferFailure = true;
        const failed = await post(application.id, key);

        assert.equal(failed.body.status, "FAILED");
        assert.deepEqual((await post(application.id, key)).body, failed.body);
        assert.equal(calls.length, before + 1);
        transferFailure = false;
        assert.equal((await post(application.id)).body.status, "SUCCEEDED");
        assert.deepEqual((await post(application.id, key)).body, failed.body);
        assert.equal(calls.length, before + 2);
      });

      for (const mode of ["unavailable", "lost-ack"]) {
        await t.test(
          `successful transfer followed by repayment ${mode} is resumed without another transfer`,
          async () => {
            const { application } = await seed();
            const key = randomUUID();
            const before = calls.length;
            proxyMode = mode;
            const uncertain = await post(application.id, key);

            assert.equal(uncertain.status, 503);
            const pending = await prisma.disbursement.findUnique({
              where: { applicationId: application.id },
              include: { attempts: true },
            });

            assert.equal(pending.status, "PROCESSING");
            assert.equal(pending.loanId, null);
            assert.equal(
              pending.attempts.filter((attempt) => attempt.status === "SUCCEEDED").length,
              1,
            );
            proxyMode = "normal";
            // Recreate the action provider to establish that recovery uses persisted state.
            const restarted = new DisbursementActionService(
              prisma,
              transfer,
              new RepaymentLoanClient(),
            );
            const result = await restarted.execute(application.id, key);

            assert.equal(result.status, "SUCCEEDED");
            assert.equal(calls.length, before + 1);
            const count = await repayment.query(
              "SELECT count(*)::int AS total FROM loans WHERE application_id = $1",
              [application.id],
            );

            assert.equal(count.rows[0].total, 1);
          },
        );
      }
      for (const transactionNumber of [1, 2]) {
        await t.test(
          `lost acknowledgement for application transaction ${transactionNumber} never repeats a transfer`,
          async () => {
            const { application } = await seed();
            const key = randomUUID();
            const before = calls.length;
            const failure = new Error("test-only lost application commit acknowledgement");
            let transactions = 0;
            const repository = {
              async $transaction(work, options) {
                const result = await prisma.$transaction(work, options);

                transactions++;

                if (transactions === transactionNumber) {
                  throw failure;
                }

                return result;
              },
            };
            const uncertain = new DisbursementActionService(
              repository,
              transfer,
              new RepaymentLoanClient(),
            );

            await assert.rejects(
              uncertain.execute(application.id, key),
              (error) => error === failure,
            );
            const restarted = new DisbursementActionService(
              prisma,
              transfer,
              new RepaymentLoanClient(),
            );
            const result = await restarted.execute(application.id, key);

            assert.equal(result.status, "SUCCEEDED");
            assert.equal(calls.length, before + 1);
          },
        );
      }

      await t.test("reusing a key with changed signed content returns a conflict", async () => {
        const { application, contract } = await seed();
        const key = randomUUID();
        transferFailure = true;

        await post(application.id, key);
        transferFailure = false;
        const changed = await prisma.loanContract.update({
          where: { id: contract.id },
          data: {
            applicationSnapshot: {
              ...contract.applicationSnapshot,
              purpose: "Changed signed input",
            },
          },
        });

        await prisma.loanContract.update({
          where: { id: contract.id },
          data: { contentHash: contractContentHash(changed) },
        });
        const result = await post(application.id, key);

        assert.equal(result.status, 409);
        assert.equal(result.body.code, "IDEMPOTENCY_CONFLICT");
      });
      await t.test(
        "borrowing remains blocked until confirmed disbursement and full loan closure",
        async () => {
          const { application } = await seed();
          const key = randomUUID();

          async function borrow() {
            const response = await fetch(`${base}/api/v1/loan-applications`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: cookie("CUSTOMER", application.customerId),
              },
              body: JSON.stringify({
                productId: application.productId,
                requestedAmount: 101,
                termMonths: 2,
                purpose: "Repeat borrowing",
              }),
            });
            const body = await response.json();

            if (response.status === 201) {
              applicationIds.push(body.id);
            }

            return { status: response.status, body };
          }

          assert.equal((await borrow()).body.code, "ACTIVE_APPLICATION_EXISTS");
          proxyMode = "unavailable";
          assert.equal((await post(application.id, key)).status, 503);
          assert.equal((await borrow()).body.code, "ACTIVE_APPLICATION_EXISTS");
          assert.equal(
            (await prisma.loanApplication.findUnique({ where: { id: application.id } })).status,
            "APPROVED",
          );
          proxyMode = "normal";
          const disbursement = await post(application.id, key);

          assert.equal(disbursement.body.status, "SUCCEEDED");
          assert.equal(
            (await prisma.loanApplication.findUnique({ where: { id: application.id } })).status,
            "DISBURSED",
          );
          assert.equal((await borrow()).body.code, "ACTIVE_LOAN_EXISTS");
          await repayment.query("UPDATE loans SET status = 'OVERDUE' WHERE id = $1", [
            disbursement.body.loanId,
          ]);
          assert.equal((await borrow()).body.code, "ACTIVE_LOAN_EXISTS");

          const schedule = await (
            await fetch(
              `${repaymentBase}/api/v1/loans/${disbursement.body.loanId}/repayment-schedule`,
              { headers: { Cookie: cookie("CUSTOMER", application.customerId) } },
            )
          ).json();

          for (const installment of schedule.items) {
            const response = await fetch(
              `${repaymentBase}/api/v1/loans/${disbursement.body.loanId}/payments`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Cookie: cookie("CUSTOMER", application.customerId),
                  "Idempotency-Key": randomUUID(),
                },
                body: JSON.stringify({
                  installmentId: installment.id,
                  amount: installment.outstandingAmount,
                }),
              },
            );

            assert.equal(response.status, 200);
          }

          const closed = await (
            await fetch(`${repaymentBase}/api/v1/loans/${disbursement.body.loanId}`, {
              headers: { Cookie: cookie("CUSTOMER", application.customerId) },
            })
          ).json();

          assert.equal(closed.status, "CLOSED");
          assert.equal(closed.outstandingAmount, 0);
          assert.ok(closed.closedAt);
          proxyMode = "unavailable";
          assert.equal((await borrow()).status, 503);
          proxyMode = "normal";
          const results = await Promise.all([borrow(), borrow(), borrow()]);

          assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409]);
          assert.deepEqual((await post(application.id, key)).body, disbursement.body);
        },
      );
    } finally {
      await app?.close();
      if (proxy) {
        await new Promise((resolve) => proxy.close(resolve));
      }
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await exited;
      }

      await repayment.query(
        "DELETE FROM payments WHERE loan_id IN (SELECT id FROM loans WHERE application_id = ANY($1::uuid[]))",
        [applicationIds],
      );
      await repayment.query(
        "DELETE FROM repayment_installments WHERE loan_id IN (SELECT id FROM loans WHERE application_id = ANY($1::uuid[]))",
        [applicationIds],
      );
      await repayment.query("DELETE FROM loans WHERE application_id = ANY($1::uuid[])", [
        applicationIds,
      ]);
      await repayment.end();
      await prisma.disbursementOperation.deleteMany({
        where: { disbursement: { applicationId: { in: applicationIds } } },
      });
      await prisma.disbursementAttempt.deleteMany({
        where: { disbursement: { applicationId: { in: applicationIds } } },
      });
      await prisma.disbursement.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await prisma.loanContract.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await prisma.loanApplication.deleteMany({ where: { id: { in: applicationIds } } });
      await prisma.$disconnect();
      await rm(runtime, { recursive: true, force: true });

      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  },
);
