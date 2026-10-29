import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { Test } from "@nestjs/testing";
import { PrismaPg } from "@prisma/adapter-pg";

import { AppModule } from "../dist/app.module.js";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { LoanCreationService } from "../dist/modules/loan/loan-creation.service.js";
import { PaymentClock } from "../dist/modules/loan/payment-clock.js";
import { PaymentsService } from "../dist/modules/loan/payments.service.js";
import { PrismaService } from "../dist/modules/prisma/prisma.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "payments enforce due installments, durable idempotency and atomic loan closure",
  { skip: !databaseUrl && "Requires a disposable local *_test database" },
  async (t) => {
    const target = new URL(databaseUrl);

    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
    assert.ok(target.pathname.endsWith("_test"));

    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const previousSecret = process.env.JWT_SECRET;
    const secret = randomBytes(32).toString("hex");
    const ids = [];
    let app;
    let now = new Date("2026-04-01T00:00:00Z");
    const clock = {
      now() {
        return new Date(now);
      },
    };

    function cookie(customerId, role = "CUSTOMER") {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: customerId,
          role,
          tokenType: "access",
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString("base64url");
      const input = `${header}.${payload}`;

      return `access_token=${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
    }

    async function seed() {
      const input = {
        applicationId: randomUUID(),
        customerId: randomUUID(),
        contractId: randomUUID(),
        disbursedAt: "2026-01-31T12:00:00.000Z",
        principalAmount: 101,
        totalInterest: 3,
        totalPayable: 104,
        schedule: [
          { installmentNumber: 1, principalAmount: 50, interestAmount: 2, totalAmount: 52 },
          { installmentNumber: 2, principalAmount: 51, interestAmount: 1, totalAmount: 52 },
        ],
      };
      const loan = await new LoanCreationService(prisma).create(input);

      ids.push(loan.id);
      const installments = await prisma.repaymentInstallment.findMany({
        where: { loanId: loan.id },
        orderBy: { installmentNumber: "asc" },
      });

      return { ...loan, installments };
    }

    try {
      process.env.JWT_SECRET = secret;
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(PaymentClock)
        .useValue(clock)
        .compile();

      app = module.createNestApplication({ logger: false });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl();

      async function pay(
        loan,
        installment = loan.installments[0],
        { amount = 52, key = randomUUID(), auth = cookie(loan.customerId) } = {},
      ) {
        const headers = { "Content-Type": "application/json", Cookie: auth };

        if (key !== null) {
          headers["Idempotency-Key"] = key;
        }

        const response = await fetch(`${base}/api/v1/loans/${loan.id}/payments`, {
          method: "POST",
          headers,
          body: JSON.stringify({ installmentId: installment.id, amount }),
        });

        return { status: response.status, body: await response.json() };
      }

      async function get(loan, suffix = "", auth = cookie(loan.customerId)) {
        const response = await fetch(`${base}/api/v1/loans/${loan.id}${suffix}`, {
          headers: { Cookie: auth },
        });

        return { status: response.status, body: await response.json() };
      }

      await t.test(
        "authorization, exact amount and earliest installment are enforced",
        async () => {
          const loan = await seed();

          assert.equal((await pay(loan, undefined, { auth: "" })).status, 401);
          assert.equal(
            (await pay(loan, undefined, { auth: cookie(loan.customerId, "STAFF") })).status,
            403,
          );
          assert.equal((await pay(loan, undefined, { auth: cookie(randomUUID()) })).status, 403);
          assert.equal((await get(loan, "", cookie(randomUUID()))).status, 403);
          assert.equal((await get(loan, "", cookie(randomUUID(), "STAFF"))).status, 200);
          assert.equal(
            (await pay(loan, loan.installments[1])).body.code,
            "INSTALLMENT_NOT_PAYABLE",
          );

          for (const amount of [0, -1, 51, 53, "52"]) {
            assert.equal((await pay(loan, undefined, { amount })).status, 400);
          }

          assert.equal((await pay(loan, undefined, { key: null })).status, 400);
          assert.equal((await pay(loan, undefined, { key: "invalid key" })).status, 400);
          assert.equal((await get(loan, "/payments?page=0")).status, 400);
          assert.equal((await get(loan, "/payments?limit=101")).status, 400);
          assert.equal((await get(loan, "/payments?owner=someone")).status, 400);
          assert.equal(await prisma.payment.count({ where: { loanId: loan.id } }), 0);
        },
      );

      await t.test(
        "an installment becomes payable exactly at Vietnam midnight on its due date",
        async () => {
          const loan = await seed();
          now = new Date("2026-02-27T16:59:59.999Z");

          assert.equal((await pay(loan)).body.code, "INSTALLMENT_NOT_DUE");
          now = new Date("2026-02-27T17:00:00.000Z");
          assert.equal((await pay(loan)).status, 200);
          assert.equal((await pay(loan, loan.installments[1])).body.code, "INSTALLMENT_NOT_DUE");
          now = new Date("2026-04-01T00:00:00Z");
        },
      );

      await t.test(
        "concurrent replays create one payment and changed input conflicts",
        async () => {
          const loan = await seed();
          const key = randomUUID();
          const results = await Promise.all(
            Array.from({ length: 4 }, () => pay(loan, undefined, { key })),
          );

          assert.ok(results.every((result) => result.status === 200));
          assert.ok(results.every((result) => result.body.id === results[0].body.id));
          assert.equal(await prisma.payment.count({ where: { loanId: loan.id } }), 1);
          assert.equal(
            (await pay(loan, undefined, { key, amount: 53 })).body.code,
            "IDEMPOTENCY_CONFLICT",
          );
          assert.equal(
            (await pay(loan, loan.installments[1], { key })).body.code,
            "IDEMPOTENCY_CONFLICT",
          );
        },
      );

      await t.test("different keys racing for an installment produce one payment", async () => {
        const loan = await seed();
        const results = await Promise.all([pay(loan), pay(loan)]);

        assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
        assert.equal(await prisma.payment.count({ where: { loanId: loan.id } }), 1);
      });

      await t.test(
        "final payment closes the loan and replay survives closure and provider restart",
        async () => {
          const loan = await seed();
          const firstKey = randomUUID();
          const first = await pay(loan, undefined, { key: firstKey });
          const pending = (await get(loan)).body;

          assert.equal(pending.status, "ACTIVE");
          assert.equal(pending.outstandingAmount, 52);
          const finalKey = randomUUID();
          const final = await pay(loan, loan.installments[1], { key: finalKey });
          const closed = (await get(loan)).body;

          assert.equal(closed.status, "CLOSED");
          assert.equal(closed.closedAt, now.toISOString());
          assert.equal(closed.outstandingAmount, 0);
          assert.deepEqual((await pay(loan, undefined, { key: firstKey })).body, first.body);
          const restarted = new PaymentsService(prisma, clock);

          assert.deepEqual(
            await restarted.pay(
              loan.id,
              loan.customerId,
              { installmentId: loan.installments[1].id, amount: 52 },
              finalKey,
            ),
            final.body,
          );
          assert.equal((await pay(loan)).body.code, "LOAN_CLOSED");
          const history = await get(loan, "/payments?limit=1&page=2");

          assert.equal(history.body.total, 2);
          assert.equal(history.body.items.length, 1);
          assert.equal(history.body.page, 2);
          assert.equal((await get(loan, "/payments", cookie(randomUUID(), "STAFF"))).status, 200);
          assert.equal((await get(loan, "/payments", cookie(randomUUID()))).status, 403);
        },
      );

      await t.test(
        "a failure after closure rolls back payment, balances and status together",
        async () => {
          const loan = await seed();

          await pay(loan);
          const failure = new Error("test-only failure before payment commit");
          const failing = new PaymentsService(
            {
              async $transaction(work) {
                return prisma.$transaction(async (tx) => {
                  await work(tx);
                  throw failure;
                });
              },
            },
            clock,
          );

          await assert.rejects(
            failing.pay(
              loan.id,
              loan.customerId,
              { installmentId: loan.installments[1].id, amount: 52 },
              randomUUID(),
            ),
            (error) => error === failure,
          );
          assert.equal(await prisma.payment.count({ where: { loanId: loan.id } }), 1);
          const saved = await prisma.loan.findUnique({ where: { id: loan.id } });
          const installment = await prisma.repaymentInstallment.findUnique({
            where: { id: loan.installments[1].id },
          });

          assert.equal(saved.status, "ACTIVE");
          assert.equal(saved.closedAt, null);
          assert.equal(installment.paidPrincipal, 0n);
          assert.equal(installment.status, "PENDING");
        },
      );

      await t.test("lost commit acknowledgement replays the committed payment", async () => {
        const loan = await seed();
        const key = randomUUID();
        const failure = new Error("test-only lost payment acknowledgement");
        const uncertain = new PaymentsService(
          {
            async $transaction(work) {
              await prisma.$transaction(work);
              throw failure;
            },
          },
          clock,
        );
        const input = { installmentId: loan.installments[0].id, amount: 52 };

        await assert.rejects(
          uncertain.pay(loan.id, loan.customerId, input, key),
          (error) => error === failure,
        );
        const result = await new PaymentsService(prisma, clock).pay(
          loan.id,
          loan.customerId,
          input,
          key,
        );

        assert.equal(result.amount, 52);
        assert.equal(await prisma.payment.count({ where: { loanId: loan.id } }), 1);
      });

      await t.test(
        "the full outstanding amount accounts for an existing installment balance",
        async () => {
          const loan = await seed();

          await prisma.repaymentInstallment.update({
            where: { id: loan.installments[0].id },
            data: { paidPrincipal: 10n, paidInterest: 2n, status: "PARTIALLY_PAID" },
          });
          assert.equal((await pay(loan)).body.code, "PAYMENT_AMOUNT_MISMATCH");
          const result = await pay(loan, undefined, { amount: 40 });

          assert.equal(result.status, 200);
          assert.equal(result.body.principalAmount, 40);
          assert.equal(result.body.interestAmount, 0);
        },
      );
    } finally {
      await app?.close();
      await prisma.payment.deleteMany({ where: { loanId: { in: ids } } });
      await prisma.repaymentInstallment.deleteMany({ where: { loanId: { in: ids } } });
      await prisma.loan.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();

      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
    }
  },
);
