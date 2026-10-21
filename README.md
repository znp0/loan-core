# Loan Application System

Backend bootstrap for the Loan Application System (LAS). This pnpm and Turborepo workspace follows [RMap's structure](https://github.com/znp0/rmap-app): independently runnable applications in `apps/` and shared tooling in `packages/`.

The only implemented endpoint is `GET /api/v1/health` in each application. Business endpoints, persistence, authentication, messaging, file storage, and external integrations are deferred. The gateway currently reports its own health; routing and service communication will be added when business APIs are implemented.

The current scaffold contains four domain services covering identity, loan products, loan applications, and repayment. `notes/LAS_spec.pdf` and `notes/API_spec_full.pdf` are evolving business and API references. All project documents, endpoint lists, and service boundaries may change as requirements develop. Keep each implementation increment focused on the agreed baseline; fuller drafts provide design context without committing the project to every described feature.

## Requirements

- Node.js 24 LTS, version 24.15.0 or later (`.nvmrc`)
- pnpm 11.25.0 (pinned in `package.json`)

With Corepack available, run `corepack enable` and `corepack prepare pnpm@11.25.0 --activate`. Otherwise, install pnpm with `npm install --global pnpm@11.25.0`.

## Get started

```sh
pnpm install --frozen-lockfile
pnpm dev
```

All applications have distinct default ports and run without environment files or infrastructure. To override a service's configuration, copy its `.env.example` to `.env` in that service directory. Environment files are loaded relative to the service's working directory; existing process environment variables take precedence.

```sh
cp apps/identity-service/.env.example apps/identity-service/.env
pnpm --filter identity-service dev
curl http://127.0.0.1:3001/api/v1/health
```

```json
{ "status": "ok", "service": "identity-service" }
```

These endpoints report process liveness. They do not check databases, brokers, or downstream services. Services bind to `127.0.0.1` by default; set `HOST=0.0.0.0` when running inside a container. `PORT` must be an integer from 1 to 65535. Setting `PORT` on a command that starts all services applies the same port to every app; use per-service `.env` files for individual overrides.

## Git hooks and commits

In a Git checkout, `pnpm install` installs Husky through the `prepare` script. The `pre-commit` hook runs lint-staged: staged JavaScript and TypeScript files pass through ESLint and Prettier, while staged JSON, YAML, and Markdown files pass through Prettier. Changes made by these tools are added back to the staged files. The `commit-msg` hook checks Conventional Commits with commitlint, for example `feat(identity-service): add health metadata` or `docs: update setup instructions`.

Run `pnpm prepare` to reinstall the hooks, `pnpm lint:staged` to check the current staged files manually, or `pnpm commitlint --edit .git/COMMIT_EDITMSG` to check a saved commit message. Hook installation is skipped in CI, production installs, source archives without Git metadata, and when `HUSKY=0` is set. CI independently checks commit messages for pull requests.

## Docker

Docker requires a running Docker Engine daemon, the Compose plugin, and the Buildx plugin. Run the following from the repository root; Node.js and pnpm on the host are optional when using Docker directly.

```sh
docker compose up --build --wait
docker compose ps
curl http://127.0.0.1:3000/api/v1/health
```

Compose builds one image per service using `docker/Dockerfile`. Each container listens on port 3000 and binds to `0.0.0.0` internally. Published ports bind to localhost at 3000, 3001, 3002, 3003, and 3007, matching the service defaults in the table below. To run just one service, use `docker compose up --build --wait identity-service`.

The multistage build prunes the workspace with Turborepo, builds the selected service, and packages its compiled output and production dependencies with `pnpm deploy --legacy --prod`. Legacy deployment supports the workspace's pinned pnpm 11 without changing how shared configuration packages are linked. Runtime images use Node 24, run as the `node` user, and include a health check for `/api/v1/health`. Compose enables an init process to forward termination signals and reap child processes.

Environment files, dependency directories, generated output, private key files, and local tool configuration are excluded from the build context. Compose supplies the non-secret runtime defaults directly; no environment file, database, or broker is needed. Source changes require rebuilding the image; use `pnpm dev` for the existing watch workflow.

```sh
docker compose logs --follow
docker compose down
```

To build an image independently, select the app by package name:

```sh
docker build --file docker/Dockerfile --build-arg SERVICE=identity-service --tag loan-core/identity-service:local .
docker run --rm --init --publish 127.0.0.1:3001:3000 loan-core/identity-service:local
```

## Workspace

```text
apps/
  api-gateway/
  identity-service/
  loan-product-service/
  loan-application-service/
  repayment-service/
packages/
  eslint-config/
  prettier-config/
  typescript-config/
docker/
  Dockerfile
  healthcheck.mjs
scripts/
  smoke.mjs
docs/
  architecture.md
notes/
  LAS_spec.pdf
  API_spec_full.pdf
```

Each app has its own package manifest, Nest CLI configuration, TypeScript configuration, environment example, root module, entry point, and health controller. There is no frontend.

| Application | Default port | Planned responsibility |
| --- | --- | --- |
| `api-gateway` | 3000 | Customer and staff API entry point |
| `identity-service` | 3001 | Accounts and authentication |
| `loan-product-service` | 3002 | Loan product definitions |
| `loan-application-service` | 3003 | Application creation and updates, documents, identity and recipient account verification, validation, contracts, submission, staff review and decisions, disbursement results |
| `repayment-service` | 3007 | Loan records and repayment schedules |

The table describes the current scaffold's proposed responsibilities; all business behavior is future work. Contract and disbursement ownership is provisional and needs review before implementation. Service boundaries depend on business responsibilities and data ownership, independently of route nesting or endpoint counts. See [architecture notes](docs/architecture.md) for the current mapping and design considerations. Repayment retains port 3007 so existing local configuration keeps working.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start every service in watch mode |
| `pnpm --filter loan-application-service dev` | Start one service in watch mode |
| `pnpm build` | Build all apps into their own `dist/` directories |
| `pnpm start` | Build and start all services |
| `pnpm --filter identity-service start` | Start one previously built service |
| `pnpm lint` | Lint repository JavaScript and service TypeScript without editing files |
| `pnpm lint:staged` | Lint and format staged source and documentation files |
| `pnpm commitlint --edit <file>` | Check a commit message stored in a file |
| `pnpm prepare` | Install Husky hooks in a Git checkout |
| `pnpm check-types` | Check each app using strict TypeScript settings |
| `pnpm format` | Apply shared Prettier formatting |
| `pnpm format:check` | Check formatting without editing files |
| `pnpm test` | Build and smoke-test every service over HTTP, then stop the processes |
| `pnpm docker:build` | Build all service images |
| `pnpm docker:up` | Build and start all containers, waiting for healthy services |
| `pnpm docker:down` | Stop and remove the Compose containers and network |
| `pnpm docker:logs` | Follow container logs |

The general tooling versions match the `create-turbo@2.11.10` basic starter: Turbo 2.11.10, ESLint 10.9.1, Prettier 3.9.6, TypeScript 7.0.2, and pnpm 11.25.0.

NestJS dependencies follow [Turborepo’s `with-nestjs` example](https://github.com/vercel/turborepo/blob/main/examples/with-nestjs/apps/api/package.json): `@nestjs/common`, `@nestjs/core`, and `@nestjs/platform-express` 12.0.2, and Nest CLI 12.0.1. The basic starter does not include NestJS. A separate reference app generated with Nest CLI 12.0.10 also targets NestJS 12 (`^12.0.1`).

Service builds and type checks invoke the TypeScript 7 compiler directly. Development builds each app first, then runs the TypeScript watcher alongside Node’s restart-on-change mode. The Nest CLI remains available for code generation and resolves its schematics and TypeScript compiler API through its own dependencies. ESLint uses the starter’s Babel TypeScript parser with support for Nest’s legacy decorators; type checking runs separately through `pnpm check-types`.

Turborepo caches builds and checks. Development and start tasks are persistent and uncached. The HTTP smoke check uses temporary ports and verifies the health response, unknown-route behavior, and process shutdown. It requires permission to bind local TCP ports.

The CI workflow installs the pinned dependency graph, checks formatting, lint and types, and runs the service smoke checks. A separate container job builds all five images, waits for healthy services, and removes the containers afterward. No database, broker, cloud account, or secrets are required for this bootstrap.

## License

This project is licensed under the [MIT License](LICENSE). Copyright © 2026 Loan Core contributors.
