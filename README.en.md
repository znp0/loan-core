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

## Tests

`pnpm test` runs the complete suite in Docker Compose with Node 24.15.0, pnpm 11.25.0 and PostgreSQL 17.11. It creates and removes its own test environment; no host PostgreSQL or development secrets are needed. Use `pnpm test:services`, `pnpm test:e2e` or `pnpm test:smoke` to run a smaller suite.

With only Docker Engine or Docker Desktop using Linux containers, Compose and Buildx installed:

```sh
docker compose --env-file docker/test.env --file compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose --env-file docker/test.env --file compose.test.yaml down --volumes --remove-orphans
```

The pnpm commands automatically run and clean up an isolated Compose project. The test database publishes no host ports. OpenAPI validation can also run directly with `pnpm test:openapi` without a database.

## Docker

Requires Docker Engine, Compose, and Buildx.

```sh
docker compose up --build --wait
docker compose down
```

## License

[MIT](LICENSE).
