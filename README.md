# Loan Core

Backend-only Loan Application System built with NestJS, TypeScript, pnpm, and Turborepo.

## Development

Requires Node.js 24 LTS and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Start one service with `pnpm --filter identity-service dev`.

## Services

| App               | Port |
| ----------------- | ---- |
| API gateway       | 3000 |
| Identity          | 3001 |
| Loan products     | 3002 |
| Loan applications | 3003 |
| Repayment         | 3004 |

Each app exposes `GET /api/v1/health`.

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
