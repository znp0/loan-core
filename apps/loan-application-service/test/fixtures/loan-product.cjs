// Contract fixture derived from loan-product-service's productResponse and the
// documented create errors. Synthetic data only; no account or cloud resources.
const { createServer } = require("node:http");

createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  const match =
    /^\/api\/v1\/internal\/loan-products\/(00000000-0000-4000-8000-00000000000[1-5])$/.exec(
      request.url,
    );
  if (request.method !== "GET" || !match) {
    response.writeHead(501).end(JSON.stringify({ code: "NOT_IMPLEMENTED" }));
    return;
  }
  const id = match[1];
  const variant = id.at(-1);
  if (variant === "3" || variant === "5") {
    response.writeHead(variant === "3" ? 404 : 503).end(
      JSON.stringify({
        code: variant === "3" ? "PRODUCT_NOT_FOUND" : "DATABASE_ERROR",
        message: "Fixture response",
        details: [],
      }),
    );
    return;
  }
  response.end(
    JSON.stringify({
      id,
      name: "Test loan product",
      description: "Synthetic contract fixture",
      status: variant === "2" ? "INACTIVE" : "ACTIVE",
      currency: "VND",
      minAmount: 1000000,
      maxAmount: 5000000,
      allowedTerms: [6, 12],
      annualInterestRate: 12.5,
      minAge: 20,
      maxAge: 60,
      requiredDocumentTypes: variant === "4" ? ["ID_FRONT"] : ["ID_FRONT", "ID_BACK"],
      createdAt: "2026-10-24T00:00:00.000Z",
      updatedAt: "2026-10-24T00:00:00.000Z",
    }),
  );
}).listen(Number(process.env.PORT ?? 4901), "127.0.0.1");
