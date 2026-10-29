import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestCredentials } from "./test-environment.mjs";
import {
  assertTestTarget,
  databaseTargets,
  disposablePostgres,
  processEnvironment,
  root,
  serviceRequire,
} from "./workflow/environment.mjs";
import { verifyLending } from "./workflow/lending.mjs";
import { run, start, stop, waitForHealth } from "./workflow/processes.mjs";

const args = process.argv.slice(2);

assert.ok(
  args.length <= 1 && args.every((value) => ["--e2e-only", "--services-only"].includes(value)),
  "Supported options: --e2e-only, --services-only",
);

const adminUrl = disposablePostgres(process.env);
const databases = databaseTargets(adminUrl);
const { Client } = serviceRequire("identity-service")("pg");
const admin = new Client({ connectionString: adminUrl });
const credentials = createTestCredentials();
const runtime = await mkdtemp(join(tmpdir(), "loan-workflow-"));
const created = [];
const roles = [];
const children = [];
let shutdownResults;
const allowedSkips = [
  "a uniqueness violation without an existing phone remains a server error",
  "unexpected storage failures return generic 500 responses without cookies or internal details",
  "cleans up confirmed metadata rollback and retains files after ambiguous commits",
];

async function port() {
  const server = createServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  await new Promise((resolve) => {
    server.close(resolve);
  });

  return port;
}

async function serviceTests(target, mode) {
  const directory = join(root, "apps", target.service);
  const files = (await readdir(join(directory, "test")))
    .filter((name) => {
      // The development project does not maintain historical migration compatibility tests.
      if (!name.endsWith(".test.mjs") || name === "disbursement-persistence.test.mjs") {
        return false;
      }

      return !(
        mode === "memory" &&
        target.service === "loan-product-service" &&
        name === "loan-products.test.mjs"
      );
    })
    .map((name) => join(directory, "test", name));
  const extra =
    mode === "postgres"
      ? { TEST_DATABASE_URL: target.url, REPAYMENT_TEST_DATABASE_URL: databases[3].url }
      : {};
  const output = await run(
    process.execPath,
    ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files],
    {
      cwd: runtime,
      env: processEnvironment(credentials, extra),
    },
  );

  await writeFile(join(runtime, `${target.service}-${mode}.tap`), output);

  if (mode === "postgres") {
    for (const line of output.split("\n").filter((line) => /# SKIP/.test(line))) {
      assert.ok(
        allowedSkips.some((title) => line.includes(title)),
        `Required PostgreSQL test skipped: ${line}`,
      );
    }
  }

  console.log(
    `PASS ${target.service} (${mode}): ${output.match(/# pass \d+/)?.[0]}, ${output.match(/# skipped \d+/)?.[0]}`,
  );
}

try {
  await admin.connect();

  for (const target of databases) {
    assertTestTarget(target.url);
    await admin.query(`CREATE ROLE "${target.role}" LOGIN PASSWORD '${target.password}'`);
    roles.push(target.role);
    await admin.query(`CREATE DATABASE "${target.name}" OWNER "${target.role}"`);
    created.push(target);
    await admin.query(`REVOKE CONNECT ON DATABASE "${target.name}" FROM PUBLIC`);
    const config = join(runtime, `${target.service}.config.ts`);
    const directory = join(root, "apps", target.service);

    await writeFile(
      config,
      `export default ${JSON.stringify({ schema: join(directory, "prisma/schema.prisma"), migrations: { path: join(directory, "prisma/migrations") }, datasource: { url: target.url } })};\n`,
    );
    await run(
      "pnpm",
      ["--filter", target.service, "exec", "prisma", "migrate", "deploy", "--config", config],
      {
        cwd: root,
        env: processEnvironment(credentials, { DATABASE_URL: target.url, DIRECT_URL: target.url }),
      },
    );
    console.log(`PASS migrations: ${target.service} disposable database`);
  }

  if (!args.includes("--e2e-only")) {
    for (const target of databases) {
      await serviceTests(target, "memory");
      await serviceTests(target, "postgres");
    }
  }

  if (!args.includes("--services-only")) {
    const ports = await Promise.all(databases.map(() => port()));
    const bases = ports.map((value) => `http://127.0.0.1:${value}`);

    for (let index = 0; index < databases.length; index++) {
      const target = databases[index];
      const child = start(
        process.execPath,
        [join(root, "scripts/workflow/service.mjs"), target.service],
        {
          cwd: runtime,
          env: processEnvironment(credentials, {
            DATABASE_URL: target.url,
            PORT: String(ports[index]),
            LOAN_PRODUCT_SERVICE_URL: bases[1],
            REPAYMENT_SERVICE_URL: bases[3],
            DOCUMENT_STORAGE_PATH: join(runtime, "documents"),
          }),
        },
      );

      children.push(child);
    }

    await Promise.all(children.map((child, index) => waitForHealth(child, bases[index])));
    await verifyLending({ bases, credentials, databases });
  }
} finally {
  shutdownResults = await Promise.allSettled(children.map((child) => stop(child)));

  for (const target of created.reverse()) {
    assertTestTarget(target.url);
    await admin.query(`DROP DATABASE "${target.name}" WITH (FORCE)`);
  }

  for (const role of roles.reverse()) {
    await admin.query(`DROP ROLE "${role}"`);
  }

  await admin.end();
  await rm(runtime, { recursive: true, force: true });
  console.log("Workflow services stopped and four disposable databases removed.");
}

for (const result of shutdownResults) {
  if (result.status === "rejected") {
    throw result.reason;
  }
}
