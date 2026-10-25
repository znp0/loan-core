import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import pg from "pg";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isDisposableTestDatabase(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.slice(1));
    const isCiDatabase =
      process.env.CI === "true" &&
      database === "repayment" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);

    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      (database.endsWith("_test") || isCiDatabase)
    );
  } catch {
    return false;
  }
}

test(
  "migration enforces one ACTIVE or OVERDUE loan per customer and a unique application ID",
  {
    skip:
      !isDisposableTestDatabase(testDatabaseUrl) &&
      "TEST_DATABASE_URL is not a disposable test database",
  },
  async () => {
    const client = new pg.Client({ connectionString: testDatabaseUrl });
    const customerId = randomUUID();
    const loanIds = [];
    const firstLoanId = randomUUID();
    const firstApplicationId = randomUUID();

    async function insertLoan(id, applicationId, customer, status) {
      loanIds.push(id);
      await client.query(
        'INSERT INTO "loans" ("id", "application_id", "customer_id", "status", "updated_at") VALUES ($1, $2, $3, $4, now())',
        [id, applicationId, customer, status],
      );
    }

    await client.connect();

    try {
      await insertLoan(firstLoanId, firstApplicationId, customerId, "ACTIVE");

      for (const status of ["ACTIVE", "OVERDUE"]) {
        await assert.rejects(
          insertLoan(randomUUID(), randomUUID(), customerId, status),
          (error) => error.code === "23505" && error.constraint === "uq_customer_active_loan",
        );
      }

      await client.query('UPDATE "loans" SET "status" = $1 WHERE "id" = $2', [
        "CLOSED",
        firstLoanId,
      ]);
      await insertLoan(randomUUID(), randomUUID(), customerId, "OVERDUE");

      await assert.rejects(
        insertLoan(randomUUID(), firstApplicationId, randomUUID(), "CLOSED"),
        (error) => error.code === "23505" && error.constraint === "loans_application_id_key",
      );
    } finally {
      try {
        await client.query('DELETE FROM "loans" WHERE "id" = ANY($1::uuid[])', [loanIds]);
      } finally {
        await client.end();
      }
    }
  },
);
