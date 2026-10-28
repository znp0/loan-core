import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configureCiEnvironments } from "../configure-ci-env.mjs";
import { testDatabases } from "../test-environment.mjs";

test("CI environments use matching generated credentials, owned databases, and refuse overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "loan-core-ci-env-"));
  const previousCi = process.env.CI;

  try {
    for (const { app } of testDatabases) {
      await mkdir(join(root, "apps", app), { recursive: true });
    }

    process.env.CI = "false";
    await assert.rejects(configureCiEnvironments(root), /only configures disposable/);

    process.env.CI = "true";
    const protectedPath = join(root, "apps", "repayment-service", ".env");
    await writeFile(protectedPath, "test-only-existing-file");
    await assert.rejects(configureCiEnvironments(root), /Refusing to overwrite/);
    await assert.rejects(stat(join(root, "apps", "identity-service", ".env")), { code: "ENOENT" });
    await rm(protectedPath);

    await configureCiEnvironments(root);
    const environments = [];
    for (const { app, database, user } of testDatabases) {
      const path = join(root, "apps", app, ".env");
      const text = await readFile(path, "utf8");
      const environment = Object.fromEntries(
        text
          .trim()
          .split("\n")
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), JSON.parse(line.slice(separator + 1))];
          }),
      );

      assert.equal(
        environment.DATABASE_URL,
        `postgresql://${user}:test-only-password@127.0.0.1:5432/${database}`,
      );
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      environments.push(environment);
    }

    for (const key of ["JWT_SECRET", "PRODUCT_INTERNAL_TOKEN", "REPAYMENT_INTERNAL_TOKEN"]) {
      assert.match(environments[0][key], /^[a-f0-9]{64}$/);
      assert.equal(new Set(environments.map((environment) => environment[key])).size, 1);
    }

    await assert.rejects(configureCiEnvironments(root), /Refusing to overwrite/);
  } finally {
    if (previousCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = previousCi;
    }
    await rm(root, { recursive: true, force: true });
  }
});
