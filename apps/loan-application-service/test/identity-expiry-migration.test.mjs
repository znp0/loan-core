import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "expiry migration preserves legacy applications and signed contracts",
  {
    skip: !databaseUrl && "Requires an isolated local *_test database",
  },
  async () => {
    const target = new URL(databaseUrl);

    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
    assert.ok(target.pathname.endsWith("_test"));

    const client = new pg.Client({ connectionString: databaseUrl });

    await client.connect();

    try {
      await client.query("BEGIN");
      const schema = `expiry_test_${randomUUID().replaceAll("-", "")}`;

      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);

      const migrations = new URL("../prisma/migrations/", import.meta.url);
      const entries = await readdir(migrations, { withFileTypes: true });
      const restore = "20261030000000_restore_identity_expiry_date";

      for (const entry of entries
        .filter((item) => item.isDirectory() && item.name < restore)
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const sql = await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8");

        await client.query(sql);
      }

      const applicationId = randomUUID();

      await client.query(
        `INSERT INTO loan_applications (id, application_number, customer_id, product_id, requested_amount, term_months, purpose, identity_issued_date, updated_at)
       VALUES ($1, $2, $3, $4, 100, 1, 'test', '2020-01-01', NOW())`,
        [applicationId, randomUUID(), randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO loan_contracts (id, application_id, contract_number, version, status, principal_amount, term_months, annual_interest_rate, total_interest, total_payable, application_snapshot, product_snapshot, schedule_preview, signed_at, content_hash, updated_at)
       VALUES ($1, $2, 'historical', 1, 'CUSTOMER_SIGNED', 100, 1, 0, 0, 100, '{"applicantInfo":{"identityNumber":"test-only"}}', '{}', '[]', NOW(), 'test-only-historical-hash', NOW())`,
        [randomUUID(), applicationId],
      );
      const before = await client.query("SELECT * FROM loan_contracts WHERE application_id = $1", [
        applicationId,
      ]);
      const sql = await readFile(new URL(`${restore}/migration.sql`, migrations), "utf8");

      await client.query(sql);

      const application = await client.query(
        "SELECT identity_expiry_date FROM loan_applications WHERE id = $1",
        [applicationId],
      );
      const after = await client.query("SELECT * FROM loan_contracts WHERE application_id = $1", [
        applicationId,
      ]);

      assert.equal(application.rows[0].identity_expiry_date, null);
      assert.deepEqual(after.rows, before.rows);

      await client.query("SAVEPOINT invalid_dates");
      await assert.rejects(
        client.query(
          "UPDATE loan_applications SET identity_expiry_date = '2019-12-31' WHERE id = $1",
          [applicationId],
        ),
        (error) => error.code === "23514",
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid_dates");
      await client.query(
        "UPDATE loan_applications SET identity_expiry_date = identity_issued_date WHERE id = $1",
        [applicationId],
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
