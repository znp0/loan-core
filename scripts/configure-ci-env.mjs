import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (process.env.CI !== "true") {
  throw new Error("This script only configures disposable CI environments.");
}

const services = [
  { app: "identity-service", database: "identity", user: "identity_service" },
  { app: "loan-product-service", database: "loan_products", user: "loan_product_service" },
  {
    app: "loan-application-service",
    database: "loan_applications",
    user: "loan_application_service",
  },
  { app: "repayment-service", database: "repayment", user: "repayment_service" },
];

for (const service of services) {
  const path = fileURLToPath(new URL(`../apps/${service.app}/.env`, import.meta.url));
  const url = `postgresql://${service.user}:test-only-password@127.0.0.1:5432/${service.database}`;

  await writeFile(path, `DATABASE_URL="${url}"\n`, { flag: "wx", mode: 0o600 });
}
