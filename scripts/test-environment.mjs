import { randomBytes } from "node:crypto";

export const testDatabases = [
  { app: "identity-service", database: "identity", user: "identity_service" },
  { app: "loan-product-service", database: "loan_products", user: "loan_product_service" },
  {
    app: "loan-application-service",
    database: "loan_applications",
    user: "loan_application_service",
  },
  { app: "repayment-service", database: "repayment", user: "repayment_service" },
];

export function createTestCredentials() {
  return {
    JWT_SECRET: randomBytes(32).toString("hex"),
    PRODUCT_INTERNAL_TOKEN: randomBytes(32).toString("hex"),
    REPAYMENT_INTERNAL_TOKEN: randomBytes(32).toString("hex"),
  };
}

export function testDatabaseUrl(service, port = "5432") {
  const value = Number(port);

  if (!/^\d+$/.test(String(port)) || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("The disposable PostgreSQL port must be between 1 and 65535.");
  }

  return `postgresql://${service.user}:test-only-password@127.0.0.1:${value}/${service.database}`;
}
