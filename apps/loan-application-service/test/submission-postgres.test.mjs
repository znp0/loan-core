import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../dist/generated/prisma/client.js");
const { ContractService } = require("../dist/modules/contract/contract.service.js");
const { SubmissionService } = require("../dist/modules/submission/submission.service.js");
const { ValidationService } = require("../dist/modules/validation/validation.service.js");
const {
  IdentityVerificationService,
} = require("../dist/modules/identity-verification/identity-verification.service.js");
const {
  DisbursementAccountVerificationService,
} = require("../dist/modules/disbursement-account-verification/disbursement-account-verification.service.js");

const databaseUrl = process.env.TEST_DATABASE_URL;
function isTestDatabase(value) {
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      decodeURIComponent(url.pathname.slice(1)).endsWith("_test")
    );
  } catch {
    return false;
  }
}

test(
  "PostgreSQL serializes submission and competing writes and rolls back a partial signature",
  {
    skip:
      !isTestDatabase(databaseUrl) &&
      "Requires a dedicated *_test database with the application schema",
    timeout: 60_000,
  },
  async (t) => {
    const tag = `submit-test-${randomUUID()}`;
    const prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        application_name: tag,
        max: 5,
      }),
    });
    const observer = new pg.Client({ connectionString: databaseUrl });
    const originalFetch = globalThis.fetch;
    const keys = [
      "LOAN_PRODUCT_SERVICE_URL",
      "REPAYMENT_SERVICE_URL",
      "PRODUCT_INTERNAL_TOKEN",
      "REPAYMENT_INTERNAL_TOKEN",
    ];
    const originalEnvironment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const ids = [];
    const productId = randomUUID();
    const product = {
      id: productId,
      minAmount: 1,
      maxAmount: 1000,
      allowedTerms: [2],
      annualInterestRate: "6.0000",
      minAge: 18,
      maxAge: 65,
      requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
    };
    const validation = new ValidationService(prisma);
    let gate;
    const evaluator = {
      async evaluate(...args) {
        const result = await validation.evaluate(...args);
        const activeGate = gate;
        gate = undefined;
        if (activeGate) {
          activeGate.entered.resolve();
          await activeGate.release.promise;
        }
        return result;
      },
    };
    const contractService = new ContractService(prisma, evaluator);
    const submission = new SubmissionService(prisma, evaluator);
    const identity = new IdentityVerificationService(prisma);
    const account = new DisbursementAccountVerificationService(prisma);

    async function seed() {
      const id = randomUUID();
      const customerId = randomUUID();
      ids.push(id);
      await prisma.loanApplication.create({
        data: {
          id,
          applicationNumber: id,
          customerId,
          productId,
          requestedAmount: 101n,
          termMonths: 2,
          purpose: "Home repair",
          fullName: "Nguyen Van A",
          dateOfBirth: new Date("1990-01-01"),
          identityNumber: "012345678901",
          identityIssuedDate: new Date("2020-01-01"),
          identityExpiryDate: new Date("2090-01-01"),
          email: "test@example.com",
          phone: "0912345678",
          addressLine: "1 Test",
          ward: "1",
          district: "1",
          province: "Test",
          employmentType: "OTHER",
          monthlyIncome: 10000000n,
          accountNumber: "0123456789",
          accountHolderName: "NGUYEN VAN A",
          accountVerificationStatus: "VERIFIED",
          contacts: {
            create: [
              { position: 0, fullName: "One", relationship: "Friend", phone: "0900000001" },
              { position: 1, fullName: "Two", relationship: "Friend", phone: "0900000002" },
            ],
          },
          documents: {
            create: ["ID_FRONT", "ID_BACK"].map((type) => ({
              type,
              fileName: "id.png",
              contentType: "image/png",
              size: 100,
              storageKey: `${id}/${type}`,
            })),
          },
          identityVerifications: { create: { status: "PASSED", verifiedAt: new Date() } },
        },
      });
      await contractService.create(id, customerId);
      return { id, customerId };
    }

    async function waitForLock(pending) {
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const result = await observer.query(
          "SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'",
          [tag],
        );
        if (result.rowCount > 0) {
          return;
        }
        assert.equal(
          settled,
          false,
          "Competing write finished before the application lock was released",
        );
        await delay(20);
      }
      assert.fail("Competing operation did not wait for a PostgreSQL lock");
    }

    await observer.connect();
    try {
      process.env.LOAN_PRODUCT_SERVICE_URL = "http://submission-product.test";
      process.env.REPAYMENT_SERVICE_URL = "http://submission-repayment.test";
      process.env.PRODUCT_INTERNAL_TOKEN = "test-product";
      process.env.REPAYMENT_INTERNAL_TOKEN = "test-repayment";
      globalThis.fetch = async (input, options) => {
        if (String(input).startsWith(process.env.LOAN_PRODUCT_SERVICE_URL)) {
          return Response.json(product);
        }
        if (String(input).startsWith(process.env.REPAYMENT_SERVICE_URL)) {
          return Response.json({ hasActiveLoan: false });
        }
        return originalFetch(input, options);
      };

      await t.test("account verification persists VERIFIED and FAILED statuses", async () => {
        const row = await seed();
        const verified = await account.verify(row.id, row.customerId);
        assert.equal(verified.status, "VERIFIED");
        assert.equal(
          (await prisma.loanApplication.findUnique({ where: { id: row.id } }))
            .accountVerificationStatus,
          "VERIFIED",
        );

        await prisma.loanApplication.update({
          where: { id: row.id },
          data: { accountHolderName: "OTHER PERSON" },
        });
        const failed = await account.verify(row.id, row.customerId);
        assert.equal(failed.status, "FAILED");
        assert.deepEqual(failed.mismatchedFields, ["accountHolderName"]);
        assert.equal(
          (await prisma.loanApplication.findUnique({ where: { id: row.id } }))
            .accountVerificationStatus,
          "FAILED",
        );
      });

      const competitors = [
        ["another submit", (row) => submission.submit(row.id, row.customerId, 1)],
        ["contract creation", (row) => contractService.create(row.id, row.customerId)],
        [
          "identity verification",
          (row) =>
            identity.verify(row.id, row.customerId, {
              identityNumber: "012345678901",
              fullName: "Nguyen Van A",
              dateOfBirth: "1990-01-01",
              identityExpiryDate: "2090-01-01",
            }),
        ],
        ["account verification", (row) => account.verify(row.id, row.customerId)],
      ];
      for (const [name, compete] of competitors) {
        await t.test(`submit blocks ${name} until the DRAFT transition commits`, async () => {
          const row = await seed();
          const barrier = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
          gate = barrier;
          const signing = submission.submit(row.id, row.customerId, 1);
          let pending;
          try {
            await Promise.race([barrier.entered.promise, signing]);
            pending = compete(row);
            const rejected = assert.rejects(
              pending,
              (error) =>
                error.getStatus() === 409 &&
                error.getResponse().code === "APPLICATION_NOT_EDITABLE",
            );
            void rejected.catch(() => {});
            await waitForLock(pending);
            barrier.release.resolve();
            assert.equal((await signing).applicationStatus, "SUBMITTED");
            await rejected;
            assert.equal(await prisma.loanContract.count({ where: { applicationId: row.id } }), 1);
            assert.equal(
              await prisma.identityVerification.count({ where: { applicationId: row.id } }),
              1,
            );
            const saved = await prisma.loanApplication.findUnique({ where: { id: row.id } });
            assert.equal(saved.accountVerificationStatus, "VERIFIED");
          } finally {
            barrier.release.resolve();
            await Promise.allSettled([signing, ...(pending ? [pending] : [])]);
          }
        });
      }

      await t.test("a new preview committed first invalidates the submitted version", async () => {
        const row = await seed();
        const barrier = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
        gate = barrier;
        const preview = contractService.create(row.id, row.customerId);
        let pending;
        try {
          await Promise.race([barrier.entered.promise, preview]);
          pending = submission.submit(row.id, row.customerId, 1);
          const rejected = assert.rejects(
            pending,
            (error) => error.getResponse().code === "CONTRACT_VERSION_MISMATCH",
          );
          void rejected.catch(() => {});
          await waitForLock(pending);
          barrier.release.resolve();
          await preview;
          await rejected;
        } finally {
          barrier.release.resolve();
          await Promise.allSettled([preview, ...(pending ? [pending] : [])]);
        }
      });

      await t.test("failure updating the application rolls back the signed contract", async () => {
        const row = await seed();
        const trigger = `fail_submit_${randomUUID().replaceAll("-", "")}`;
        try {
          await observer.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.id = '${row.id}'::uuid AND NEW.status = 'SUBMITTED' THEN
            RAISE EXCEPTION 'injected submit failure'; END IF; RETURN NEW; END; $$`);
          await observer.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON loan_applications
          FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
          await assert.rejects(
            submission.submit(row.id, row.customerId, 1),
            /injected submit failure/,
          );
          const application = await prisma.loanApplication.findUnique({ where: { id: row.id } });
          const contract = await prisma.loanContract.findFirst({
            where: { applicationId: row.id },
          });
          assert.equal(application.status, "DRAFT");
          assert.equal(application.submittedAt, null);
          assert.equal(contract.status, "DRAFT");
          assert.equal(contract.signedAt, null);
          assert.equal(contract.contentHash, null);
        } finally {
          await observer.query(`DROP TRIGGER IF EXISTS ${trigger} ON loan_applications`);
          await observer.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
        }
      });
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      try {
        await prisma.loanContract.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.identityVerification.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.applicationDocument.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.loanApplication.deleteMany({ where: { id: { in: ids } } });
      } finally {
        await prisma.$disconnect();
        await observer.end();
      }
    }
  },
);
