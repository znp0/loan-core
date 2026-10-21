import { spawnSync } from "node:child_process";

async function installHooks() {
  const shouldSkip =
    process.env.HUSKY === "0" || process.env.CI === "true" || process.env.NODE_ENV === "production";

  if (shouldSkip) {
    return;
  }

  const repository = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore",
  });

  if (repository.status !== 0) {
    return;
  }

  const { default: husky } = await import("husky");
  const error = husky();

  if (error) {
    throw new Error(error);
  }
}

await installHooks();
