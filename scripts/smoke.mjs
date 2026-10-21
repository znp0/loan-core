import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

async function availablePort() {
  const server = createServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const { port } = server.address();

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve();
    });
  });

  return port;
}

async function checkService(directory) {
  const cwd = resolve(root, "apps", directory);
  const manifest = await readFile(resolve(cwd, "package.json"), "utf8");
  const { name } = JSON.parse(manifest);
  const port = await availablePort();

  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";

  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });

  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });

  // Attach the exit listener immediately so shutdown cannot miss an exit event.
  const exited = once(child, "exit");

  exited.catch(() => {});
  children.push({ child, exited });

  const url = `http://127.0.0.1:${port}/api/v1`;
  let response;

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name} exited before becoming healthy:\n${logs}`);
    }

    try {
      response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });

      break;
    } catch {
      await setTimeout(100);
    }
  }

  assert.ok(response, `${name} did not become healthy:\n${logs}`);
  assert.equal(response.status, 200, name);
  assert.deepEqual(await response.json(), { status: "ok", service: name });

  const unknownRouteResponse = await fetch(`${url}/not-a-route`);

  assert.equal(unknownRouteResponse.status, 404, name);

  console.log(`PASS ${name}: health endpoint and unknown route`);
}

try {
  const directories = await readdir(resolve(root, "apps"), { withFileTypes: true });

  const results = await Promise.allSettled(
    directories.filter((entry) => entry.isDirectory()).map((entry) => checkService(entry.name)),
  );

  const failures = results.filter((result) => result.status === "rejected");

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Service smoke checks failed",
    );
  }
} finally {
  await Promise.all(
    children.map(async ({ child, exited }) => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }

      const forceStop = globalThis.setTimeout(() => {
        child.kill("SIGKILL");
      }, 5000);

      try {
        const [code, signal] = await exited;

        assert.ok(code === 0 || signal === "SIGTERM", "Service did not shut down cleanly");
      } finally {
        globalThis.clearTimeout(forceStop);
      }
    }),
  );
}
