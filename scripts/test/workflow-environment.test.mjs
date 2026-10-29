import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTestTarget,
  databaseTargets,
  disposablePostgres,
  processEnvironment,
} from "../workflow/environment.mjs";

test("workflow refuses unmarked instances and cannot inherit managed database settings", () => {
  assert.throws(() => disposablePostgres({}), /WORKFLOW_DISPOSABLE_POSTGRES/);
  assert.throws(() =>
    disposablePostgres({ WORKFLOW_DISPOSABLE_POSTGRES: "1", WORKFLOW_POSTGRES_PORT: "bad" }),
  );
  const admin = disposablePostgres({
    WORKFLOW_DISPOSABLE_POSTGRES: "1",
    DATABASE_URL: "postgres://managed.example/production",
  });
  const targets = databaseTargets(admin);

  assert.equal(new Set(targets.map(({ name }) => name)).size, 4);

  for (const { url } of targets) {
    assert.doesNotThrow(() => assertTestTarget(url));
  }

  assert.throws(() => assertTestTarget("postgresql://127.0.0.1/development_test"));
  assert.throws(() => assertTestTarget(targets[0].url.replace("127.0.0.1", "managed.example")));
  assert.equal(processEnvironment({}).DATABASE_URL, undefined);
  assert.equal(processEnvironment({}).DIRECT_URL, undefined);
});
