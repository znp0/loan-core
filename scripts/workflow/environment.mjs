import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const services = [
  "identity-service",
  "loan-product-service",
  "loan-application-service",
  "repayment-service",
];

export function serviceRequire(service) {
  return createRequire(new URL(`../../apps/${service}/package.json`, import.meta.url));
}

export function disposablePostgres(environment) {
  if (environment.WORKFLOW_DISPOSABLE_POSTGRES !== "1") {
    throw new Error(
      "Set WORKFLOW_DISPOSABLE_POSTGRES=1 only for a disposable local PostgreSQL instance.",
    );
  }

  const port = environment.WORKFLOW_POSTGRES_PORT ?? "5432";

  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("WORKFLOW_POSTGRES_PORT must be between 1 and 65535.");
  }

  // This runner deliberately cannot select managed databases or inherit development URLs.
  return `postgresql://postgres:test-only-password@127.0.0.1:${port}/postgres`;
}

export function databaseTargets(adminUrl) {
  const run = randomUUID().replaceAll("-", "");

  return services.map((service, index) => {
    const name = `loan_workflow_${run}_${index}_test`;
    const role = `${name}_owner`;
    const password = randomBytes(32).toString("hex");
    const url = new URL(adminUrl);

    url.pathname = `/${name}`;
    url.username = role;
    url.password = password;

    return { service, name, role, password, url: url.href };
  });
}

export function assertTestTarget(value) {
  const url = new URL(value);

  if (
    url.hostname !== "127.0.0.1" ||
    !/^\/loan_workflow_[a-f0-9]{32}_[0-3]_test$/.test(url.pathname)
  ) {
    throw new Error("Refusing a database not owned by this disposable workflow run.");
  }
}

export function processEnvironment(credentials, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CI: process.env.CI,
    HUSKY: "0",
    NODE_ENV: "test",
    ...credentials,
    ...extra,
  };
}
