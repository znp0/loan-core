# Loan Core

Backend-only Loan Application System built with NestJS, TypeScript, pnpm, and Turborepo.

## Development

Requires Node.js 24.15.0+ (24 LTS) or Node.js 26+, pnpm 11.25.0, and a separate PostgreSQL database for each service.

```sh
pnpm install --frozen-lockfile
pnpm secrets:setup
pnpm secrets:pull
pnpm db:generate
pnpm --filter identity-service db:deploy
pnpm --filter loan-product-service db:deploy
pnpm --filter loan-application-service db:deploy
pnpm --filter repayment-service db:deploy
pnpm dev
```

Start one service with `pnpm --filter identity-service dev`.

## Services

| App               | Port |
| ----------------- | ---- |
| Identity          | 3001 |
| Loan products     | 3002 |
| Loan applications | 3003 |
| Repayment         | 3004 |

Each app exposes `GET /api/v1/health`, Swagger UI at `/api/docs`, and OpenAPI JSON at `/api/openapi.json`. Clients call services directly.

## Commands

```sh
pnpm build
pnpm lint
pnpm check-types
pnpm test
pnpm format:check
```

## Docker

Requires Docker Engine, Compose, and Buildx.

```sh
docker compose up --build --wait
docker compose down
```

## License

[MIT](LICENSE).
