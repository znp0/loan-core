import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const suites = new Map([
  [undefined, "all"],
  ["--e2e", "e2e"],
  ["--services", "services"],
  ["--smoke", "smoke"],
]);
const args = process.argv.slice(2);

if (args.length > 1 || !suites.has(args[0])) {
  throw new Error("Supported options: --e2e, --services, --smoke.");
}

const project = `loan-core-tests-${randomUUID().slice(0, 8)}`;
const compose = [
  "compose",
  "--project-name",
  project,
  "--env-file",
  "docker/test.env",
  "--file",
  "compose.test.yaml",
];
const environment = {
  ...process.env,
  LOAN_CORE_TEST_SUITE: suites.get(args[0]),
  COMPOSE_MENU: "false",
};
let interrupted = false;
let activeChild;

function interrupt() {
  if (interrupted) {
    return;
  }

  interrupted = true;
  activeChild?.kill("SIGINT");
}

process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

function runCompose(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...compose, ...arguments_], {
      cwd: root,
      env: environment,
      stdio: "inherit",
    });

    activeChild = child;
    child.once("error", () => {
      activeChild = undefined;
      reject(
        new Error(
          "Docker with Compose is required. Start Docker Engine or Docker Desktop and retry.",
        ),
      );
    });
    child.once("exit", (code) => {
      activeChild = undefined;
      resolve(code ?? 1);
    });
  });
}

try {
  process.exitCode = await runCompose([
    "up",
    "--build",
    "--abort-on-container-exit",
    "--exit-code-from",
    "tests",
  ]);

  if (interrupted) {
    process.exitCode = 130;
  }
} finally {
  const cleanup = await runCompose(["down", "--volumes", "--remove-orphans"]);

  if (cleanup !== 0) {
    process.exitCode = cleanup;
  }
}
