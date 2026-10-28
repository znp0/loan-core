import "reflect-metadata";

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../dist/generated/prisma/client.js");
const { DisbursementService } = require("../dist/modules/disbursement/disbursement.service.js");
const applicationId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

test("a concurrent completion cannot mix an old parent with a new successful attempt", async () => {
  let committed = false;

  // Simulate PostgreSQL statement snapshots at the driver boundary while keeping Prisma's real query planning.
  function adapter(snapshot = undefined) {
    return {
      provider: "postgres",
      adapterName: "@prisma/adapter-pg",
      options: { usePhantomQuery: true },
      async queryRaw({ sql }) {
        const visibleCompletion = snapshot ?? committed;
        if (sql.includes('"loan_applications"')) {
          return {
            columnNames: ["id", "customer_id"],
            columnTypes: [15, 15],
            rows: [[applicationId, customerId]],
          };
        }

        if (sql.includes('"disbursement_attempts"')) {
          return {
            columnNames: [
              "id",
              "disbursement_id",
              "attempt_number",
              "status",
              "transaction_reference",
              "failure_code",
              "failure_message",
              "processed_at",
            ],
            columnTypes: [15, 15, 0, 12, 7, 7, 7, 10],
            rows: visibleCompletion
              ? [
                  [
                    applicationId,
                    applicationId,
                    1,
                    "SUCCEEDED",
                    "test",
                    null,
                    null,
                    "2026-10-28T01:00:00.000Z",
                  ],
                ]
              : [],
          };
        }

        assert.ok(sql.includes('"disbursements"'));
        committed = true;

        return {
          columnNames: [
            "id",
            "application_id",
            "amount",
            "currency",
            "account_number",
            "account_holder_name",
            "status",
            "loan_id",
            "created_at",
            "completed_at",
          ],
          columnTypes: [15, 15, 1, 12, 7, 7, 12, 15, 10, 10],
          rows: [
            [
              applicationId,
              applicationId,
              "100",
              "VND",
              "123456",
              "Test",
              "PROCESSING",
              null,
              "2026-10-28T00:00:00.000Z",
              null,
            ],
          ],
        };
      },
      async startTransaction(isolationLevel) {
        return adapter(isolationLevel === "REPEATABLE READ" ? committed : undefined);
      },
      async executeRaw() {
        return 0;
      },
      async commit() {},
      async rollback() {},
      async dispose() {},
    };
  }

  const prisma = new PrismaClient({
    adapter: {
      provider: "postgres",
      adapterName: "@prisma/adapter-pg",
      async connect() {
        return adapter();
      },
    },
  });

  try {
    const result = await new DisbursementService(prisma).get(applicationId, customerId, "CUSTOMER");
    assert.equal(result.status, "PROCESSING");
    assert.equal(result.loanId, null);
    assert.deepEqual(result.attempts, []);
  } finally {
    await prisma.$disconnect();
  }
});
