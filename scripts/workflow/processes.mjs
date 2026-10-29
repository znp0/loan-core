import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

export function start(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const exited = once(child, "exit");

  void exited.catch(() => {});

  return { child, exited, output: () => output };
}

export async function run(command, args, options) {
  const process = start(command, args, options);
  const [code] = await process.exited;
  const output = process.output();

  assert.equal(code, 0, `${command} ${args.join(" ")} failed:\n${output}`);

  return output;
}

export async function stop(process) {
  if (process.child.exitCode !== null || process.child.signalCode !== null) {
    return;
  }

  process.child.kill("SIGTERM");
  const timeout = globalThis.setTimeout(() => {
    process.child.kill("SIGKILL");
  }, 5000);

  try {
    const [code, signal] = await process.exited;

    assert.ok(code === 0 || signal === "SIGTERM", "Workflow service must stop cleanly");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function waitForHealth(process, base) {
  for (let attempt = 0; attempt < 150; attempt++) {
    assert.equal(process.child.exitCode, null, process.output());

    try {
      const response = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) });

      if (response.ok) {
        return;
      }
    } catch {
      // Give the child time to finish connecting to its isolated database.
    }

    await delay(100);
  }

  throw new Error(`Workflow service did not become healthy:\n${process.output()}`);
}
