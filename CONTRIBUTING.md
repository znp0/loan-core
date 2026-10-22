# Contributing

Follow [README.md](README.md) for runtime requirements and dependency installation.

## Development secrets

Install the [Doppler CLI](https://docs.doppler.com/docs/install-cli). From the repository root, run:

```sh
doppler login --scope .
pnpm secrets:setup
pnpm secrets:pull
pnpm dev
```

[doppler.yaml](doppler.yaml) maps each domain service to its own config in project `loan-core`, under the `dev` environment. The gateway needs no database credentials.

Run `pnpm secrets:pull` again after shared settings change in Doppler. It replaces each domain service's ignored `.env` with its current config, including `DATABASE_URL` and `DIRECT_URL`. Downloads finish before local files are replaced; files have owner-only permissions and values are never printed. Existing development, Prisma, and Docker commands read these files as usual.

Keep shared settings in Doppler and placeholders in `.env.example`. Keep personal overrides in a personal branch config and configure that service directory to use it with `doppler setup`. Do not commit credentials or share Doppler login tokens.

CI uses disposable databases and never needs Doppler credentials. The pull command refuses to run in CI.
