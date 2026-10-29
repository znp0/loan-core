import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { Test } from "@nestjs/testing";
import { PrismaPg } from "@prisma/adapter-pg";

import { AppModule } from "../dist/app.module.js";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { LoanCreationService } from "../dist/modules/loan/loan-creation.service.js";
import { installmentDueDate } from "../dist/modules/loan/official-schedule.js";
import { PrismaService } from "../dist/modules/prisma/prisma.service.js";

test("official due dates preserve the transfer day across month ends and leap years", () => {
  for (const [timestamp, expected] of [
    ["2028-01-31T12:00:00Z", ["2028-02-29", "2028-03-31"]],
    ["2027-01-31T12:00:00Z", ["2027-02-28", "2027-03-31"]],
    ["2026-08-31T12:00:00Z", ["2026-09-30", "2026-10-31"]],
    ["2026-12-31T18:00:00Z", ["2027-02-01", "2027-03-01"]],
  ]) {
    assert.deepEqual(
      [1, 2].map((offset) =>
        installmentDueDate(new Date(timestamp), offset).toISOString().slice(0, 10),
      ),
      expected,
    );
  }
});

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "loan creation authenticates, deduplicates and persists schedule snapshots atomically",
  { skip: !databaseUrl && "Requires a disposable local *_test database" },
  async (t) => {
    const target = new URL(databaseUrl);

    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
    assert.ok(target.pathname.endsWith("_test"));

    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const originalToken = process.env.REPAYMENT_INTERNAL_TOKEN;
    const originalSecret = process.env.JWT_SECRET;
    const token = randomBytes(32).toString("hex");
    const ids = [];
    let app;

    function input(overrides = {}) {
      const dto = {
        applicationId: randomUUID(),
        customerId: randomUUID(),
        contractId: randomUUID(),
        disbursedAt: "2028-01-31T12:00:00.000Z",
        principalAmount: 101,
        totalInterest: 3,
        totalPayable: 104,
        schedule: [
          { installmentNumber: 1, principalAmount: 50, interestAmount: 2, totalAmount: 52 },
          { installmentNumber: 2, principalAmount: 51, interestAmount: 1, totalAmount: 52 },
        ],
        ...overrides,
      };

      ids.push(dto.applicationId);

      return dto;
    }

    try {
      process.env.REPAYMENT_INTERNAL_TOKEN = token;
      process.env.JWT_SECRET = randomBytes(32).toString("hex");
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();

      app = module.createNestApplication({ logger: false });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl();

      async function post(body, internalToken = token) {
        const response = await fetch(`${base}/api/v1/internal/loans`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Service-Token": internalToken,
          },
          body: JSON.stringify(body),
        });

        return { status: response.status, body: await response.json() };
      }

      await t.test("internal token and exact contract amounts are required", async () => {
        const dto = input();

        assert.equal((await post(dto, "wrong")).status, 401);
        for (const invalid of [
          { ...dto, principalAmount: "101" },
          { ...dto, disbursedAt: "2027-02-29T00:00:00Z" },
          { ...dto, totalPayable: 105 },
          { ...dto, schedule: [] },
          { ...dto, schedule: [{ ...dto.schedule[0], unexpected: true }, dto.schedule[1]] },
          { ...dto, schedule: [dto.schedule[1], dto.schedule[0]] },
        ]) {
          const result = await post(invalid);

          assert.equal(result.status, 400);
          assert.equal(result.body.code, "VALIDATION_ERROR");
        }

        assert.equal(await prisma.loan.count({ where: { applicationId: dto.applicationId } }), 0);
      });

      await t.test(
        "concurrent duplicate requests create one loan and exact installments",
        async () => {
          const dto = input();
          const results = await Promise.all(Array.from({ length: 4 }, () => post(dto)));

          assert.ok(results.every((result) => result.status === 200));
          assert.equal(new Set(results.map((result) => result.body.id)).size, 1);
          const loan = await prisma.loan.findUnique({
            where: { applicationId: dto.applicationId },
            include: { installments: { orderBy: { installmentNumber: "asc" } } },
          });

          assert.equal(loan.installments.length, 2);
          assert.deepEqual(
            loan.installments.map((item) => item.dueDate.toISOString().slice(0, 10)),
            ["2028-02-29", "2028-03-31"],
          );
          assert.deepEqual(
            loan.installments.map((item) => [
              Number(item.openingPrincipal),
              Number(item.principalAmount),
              Number(item.interestAmount),
            ]),
            [
              [101, 50, 2],
              [51, 51, 1],
            ],
          );
          const replay = await post({ ...dto, disbursedAt: "2028-01-31T19:00:00+07:00" });

          assert.equal(replay.body.id, loan.id);
          const conflict = await post({ ...dto, contractId: randomUUID() });

          assert.equal(conflict.status, 409);
          assert.equal(conflict.body.code, "LOAN_INPUT_CONFLICT");
        },
      );

      await t.test(
        "competing applications cannot give the same customer two active loans",
        async () => {
          const customerId = randomUUID();
          const results = await Promise.all([
            post(input({ customerId })),
            post(input({ customerId })),
          ]);

          assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
          assert.equal(await prisma.loan.count({ where: { customerId } }), 1);
        },
      );

      await t.test(
        "failure after the nested write rolls back both loan and installments",
        async () => {
          const dto = input();
          const failure = new Error("test-only failure before commit");
          const service = new LoanCreationService({
            async $transaction(work) {
              return prisma.$transaction(async (tx) => {
                await work(tx);
                throw failure;
              });
            },
          });

          await assert.rejects(service.create(dto), (error) => error === failure);
          assert.equal(await prisma.loan.count({ where: { applicationId: dto.applicationId } }), 0);
          assert.equal(
            await prisma.repaymentInstallment.count({
              where: { loan: { applicationId: dto.applicationId } },
            }),
            0,
          );
        },
      );
    } finally {
      await app?.close();
      await prisma.repaymentInstallment.deleteMany({
        where: { loan: { applicationId: { in: ids } } },
      });
      await prisma.loan.deleteMany({ where: { applicationId: { in: ids } } });
      await prisma.$disconnect();

      if (originalToken === undefined) {
        delete process.env.REPAYMENT_INTERNAL_TOKEN;
      } else {
        process.env.REPAYMENT_INTERNAL_TOKEN = originalToken;
      }

      if (originalSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalSecret;
      }
    }
  },
);
