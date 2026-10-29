import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../run-container-tests.mjs", import.meta.url));

test("container runner propagates failures and always removes its own Compose project", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "loan-compose-command-"));
  const executable = join(directory, "docker");
  const log = join(directory, "commands.jsonl");

  await writeFile(
    executable,
    `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.TEST_COMPOSE_LOG, JSON.stringify({ args, suite: process.env.LOAN_CORE_TEST_SUITE }) + "\\n");
if (args.includes("up")) {
  if (process.env.TEST_COMPOSE_WAIT === "1") {
    process.on("SIGINT", () => process.exit(130));
    setInterval(() => {}, 1000);
  } else {
    process.exit(Number(process.env.TEST_COMPOSE_EXIT));
  }
}
`,
  );
  await chmod(executable, 0o755);

  function start(args, extra) {
    const child = spawn(process.execPath, [runner, ...args], {
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH}`,
        TEST_COMPOSE_LOG: log,
        ...extra,
      },
      stdio: "ignore",
    });
    const exited = once(child, "exit");

    return { child, exited };
  }

  try {
    for (const code of [0, 7]) {
      await t.test(`test exit ${code} still removes containers and volumes`, async () => {
        await writeFile(log, "");
        const { exited } = start(["--e2e"], { TEST_COMPOSE_EXIT: String(code) });

        assert.equal((await exited)[0], code);
        const commands = (await readFile(log, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));

        assert.equal(commands.length, 2);
        assert.equal(commands[0].suite, "e2e");
        assert.ok(commands[0].args.includes("--exit-code-from"));
        assert.ok(commands[1].args.includes("down"));
        assert.ok(commands[1].args.includes("--volumes"));
        const projectIndex = commands[0].args.indexOf("--project-name") + 1;

        assert.match(commands[0].args[projectIndex], /^loan-core-tests-[a-f0-9]{8}$/);
        assert.equal(commands[1].args[projectIndex], commands[0].args[projectIndex]);
        assert.ok(commands[0].args.includes("docker/test.env"));
      });
    }

    await t.test("interrupting a run still performs cleanup", async () => {
      await writeFile(log, "");
      const { child, exited } = start([], { TEST_COMPOSE_WAIT: "1" });

      try {
        let started = false;

        for (let attempt = 0; attempt < 100; attempt++) {
          started = (await readFile(log, "utf8")).includes('"up"');

          if (started) {
            break;
          }

          await delay(20);
        }

        assert.ok(started);
        child.kill("SIGTERM");
        assert.equal((await exited)[0], 130);
        assert.ok((await readFile(log, "utf8")).includes('"down"'));
      } finally {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
