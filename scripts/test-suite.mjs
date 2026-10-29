import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { createTestCredentials } from "./test-environment.mjs";
import {
  disposablePostgres,
  processEnvironment,
  root,
  serviceRequire,
  services,
} from "./workflow/environment.mjs";
import { run } from "./workflow/processes.mjs";

const suite = process.env.LOAN_CORE_TEST_SUITE ?? "all";

assert.ok(["all", "services", "e2e", "smoke"].includes(suite), "Unknown test suite.");

for (const service of services) {
  assert.equal(
    existsSync(join(root, "apps", service, ".env")),
    false,
    "The test image must exclude development environments.",
  );
}

const environment = processEnvironment(createTestCredentials(), {
  WORKFLOW_DISPOSABLE_POSTGRES: "1",
});
const { Client } = serviceRequire("identity-service")("pg");
const postgres = new Client({ connectionString: disposablePostgres(process.env) });
let databaseVersion;

try {
  await postgres.connect();
  const result = await postgres.query("SHOW server_version");

  databaseVersion = result.rows[0].server_version;
  assert.match(
    databaseVersion,
    /^17\.11(?:\D|$)/,
    "Use the PostgreSQL version pinned in compose.test.yaml.",
  );
} finally {
  await postgres.end();
}

async function execute(label, args) {
  console.log(`Running ${label}`);
  const output = await run(process.execPath, args, { cwd: root, env: environment });

  process.stdout.write(output);
}

async function tests(directory) {
  const files = (await readdir(join(root, directory)))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(root, directory, name));

  await execute(directory, ["--test", ...files]);
}

console.log(
  `Test environment: Node ${process.version}; PostgreSQL ${databaseVersion}; suite=${suite}`,
);

if (suite === "all" || suite === "services") {
  await tests("scripts/test");
  await tests("packages/http/test");
  await tests("packages/auth/test");
}

if (suite === "all") {
  await execute("OpenAPI validation without a database connection", ["scripts/test-openapi.mjs"]);
}

if (suite === "all" || suite === "smoke") {
  await execute("service startup, Swagger and shutdown smoke", ["scripts/smoke.mjs"]);
}

if (suite === "all") {
  await execute("service tests and backend E2E", ["scripts/test-workflow.mjs"]);
} else if (suite === "services") {
  await execute("service tests", ["scripts/test-workflow.mjs", "--services-only"]);
} else if (suite === "e2e") {
  await execute("backend E2E", ["scripts/test-workflow.mjs", "--e2e-only"]);
}
