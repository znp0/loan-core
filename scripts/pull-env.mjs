import { execFile } from "node:child_process";
import { rename, rm, writeFile } from "node:fs/promises";
import { parseEnv, promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const services = [
  "identity-service",
  "loan-product-service",
  "loan-application-service",
  "repayment-service",
];

async function downloadEnvironment(service) {
  const directory = new URL(`apps/${service}/`, root);
  let contents;

  try {
    const result = await run(
      "doppler",
      ["secrets", "download", "--no-file", "--no-fallback", "--no-read-env", "--format", "env"],
      { cwd: directory, timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
    );

    contents = result.stdout;
  } catch {
    throw new Error(
      `Cannot fetch secrets for ${service}. Install Doppler, log in, and run pnpm secrets:setup.`,
    );
  }

  let variables;

  try {
    variables = parseEnv(contents);
  } catch {
    throw new Error(`Doppler returned an invalid environment file for ${service}.`);
  }

  if (!variables.DATABASE_URL) {
    throw new Error(`The Doppler config for ${service} must contain DATABASE_URL.`);
  }

  return { service, directory, contents };
}

async function main() {
  if (process.env.CI) {
    throw new Error("CI must use its disposable databases instead of managed development secrets.");
  }

  // Fetch every config before changing any local files.
  const downloads = await Promise.all(services.map(downloadEnvironment));
  const pending = [];

  try {
    for (const download of downloads) {
      const temporary = new URL(`.env.${process.pid}.tmp`, download.directory);
      const destination = new URL(".env", download.directory);

      await writeFile(temporary, download.contents, { flag: "wx", mode: 0o600 });

      pending.push({ service: download.service, temporary, destination });
    }

    for (const file of pending) {
      await rename(file.temporary, file.destination);

      console.log(`Updated apps/${file.service}/.env`);
    }
  } finally {
    await Promise.all(
      pending.map((file) => {
        return rm(file.temporary, { force: true });
      }),
    );
  }
}

main().catch((error) => {
  console.error(error.message);

  process.exitCode = 1;
});
