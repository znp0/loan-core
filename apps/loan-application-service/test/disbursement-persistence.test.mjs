import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import pg from "pg";

const databaseUrl = process.env.DISBURSEMENT_TEST_DATABASE_URL;

test(
  "disbursement migration enforces writer constraints and ordered attempt reads",
  {
    skip:
      !databaseUrl &&
      "Set DISBURSEMENT_TEST_DATABASE_URL to a disposable local loan_core_test* database.",
  },
  async () => {
    const target = new URL(databaseUrl);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
    assert.ok(target.pathname.startsWith("/loan_core_test"));
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      await client.query("BEGIN");
      const schema = `disbursement_test_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      const migrations = new URL("../prisma/migrations/", import.meta.url);
      const directories = await readdir(migrations, { withFileTypes: true });
      for (const directory of directories
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const sql = await readFile(new URL(`${directory.name}/migration.sql`, migrations), "utf8");
        await client.query(sql);
      }

      const applicationId = randomUUID();
      const disbursementId = randomUUID();
      await client.query(
        `INSERT INTO loan_applications (id, application_number, customer_id, product_id, requested_amount, term_months, purpose, updated_at) VALUES ($1, $2, $3, $4, 100, 12, 'test', NOW())`,
        [applicationId, randomUUID(), randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO disbursements (id, application_id, amount, account_number, account_holder_name) VALUES ($1, $2, 100, '1234567890', 'Test')`,
        [disbursementId, applicationId],
      );

      async function rejected(sql, params, code) {
        await client.query("SAVEPOINT rejected_write");
        await assert.rejects(client.query(sql, params), { code });
        await client.query("ROLLBACK TO SAVEPOINT rejected_write");
      }

      await rejected(
        `INSERT INTO disbursements (id, application_id, amount, account_number, account_holder_name) VALUES ($1, $2, 100, '123', 'Test')`,
        [randomUUID(), applicationId],
        "23505",
      );
      for (const amount of ["0", "-1", "9007199254740992"]) {
        await rejected(
          "UPDATE disbursements SET amount = $1 WHERE id = $2",
          [amount, disbursementId],
          "23514",
        );
      }
      await client.query("UPDATE disbursements SET amount = 9007199254740991 WHERE id = $1", [
        disbursementId,
      ]);
      const insertAttempt = `INSERT INTO disbursement_attempts (id, disbursement_id, attempt_number, status, processed_at) VALUES ($1, $2, $3, $4, NOW())`;
      await client.query(insertAttempt, [randomUUID(), disbursementId, 2, "SUCCEEDED"]);
      await client.query(insertAttempt, [randomUUID(), disbursementId, 1, "FAILED"]);
      await rejected(insertAttempt, [randomUUID(), disbursementId, 1, "FAILED"], "23505");
      await rejected(insertAttempt, [randomUUID(), disbursementId, 3, "SUCCEEDED"], "23505");
      await rejected(insertAttempt, [randomUUID(), disbursementId, 0, "FAILED"], "23514");
      await rejected("DELETE FROM loan_applications WHERE id = $1", [applicationId], "23503");
      await rejected("DELETE FROM disbursements WHERE id = $1", [disbursementId], "23503");
      const result = await client.query(
        "SELECT attempt_number FROM disbursement_attempts WHERE disbursement_id = $1 ORDER BY attempt_number",
        [disbursementId],
      );
      assert.deepEqual(
        result.rows.map((row) => row.attempt_number),
        [1, 2],
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
