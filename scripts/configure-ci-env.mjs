import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestCredentials, testDatabases, testDatabaseUrl } from "./test-environment.mjs";

export async function configureCiEnvironments(root) {
  if (process.env.CI !== "true") {
    throw new Error("This script only configures disposable CI environments.");
  }

  const credentials = createTestCredentials();
  const targets = testDatabases.map((service) => ({
    service,
    path: resolve(root, "apps", service.app, ".env"),
  }));

  if (targets.some(({ path }) => existsSync(path))) {
    throw new Error("Refusing to overwrite existing service environments.");
  }

  for (const { service, path } of targets) {
    const environment = { DATABASE_URL: testDatabaseUrl(service), ...credentials };
    const content = Object.entries(environment)
      .map(([key, value]) => `${key}="${value}"`)
      .join("\n");

    await writeFile(path, `${content}\n`, { flag: "wx", mode: 0o600 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await configureCiEnvironments(fileURLToPath(new URL("..", import.meta.url)));
}
