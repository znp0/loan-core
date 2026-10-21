# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG SERVICE=api-gateway

FROM node:${NODE_VERSION}-bookworm-slim AS tooling

ARG PNPM_VERSION=11.25.0
ARG TURBO_VERSION=2.11.10

RUN npm install --global pnpm@${PNPM_VERSION} turbo@${TURBO_VERSION}

WORKDIR /workspace

FROM tooling AS pruner

ARG SERVICE

COPY . .

RUN turbo prune "${SERVICE}" --docker

FROM tooling AS builder

ARG SERVICE

ENV HUSKY=0

COPY .husky/install.mjs ./.husky/install.mjs
COPY --from=pruner /workspace/out/json/ ./
COPY --from=pruner /workspace/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /workspace/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,id=loan-core-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY --from=pruner /workspace/out/full/ ./

RUN pnpm --filter "${SERVICE}" build

RUN --mount=type=cache,id=loan-core-pnpm,target=/pnpm/store \
    pnpm --filter "${SERVICE}" deploy --legacy --prod --store-dir /pnpm/store /runtime

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /runtime/ ./
COPY --chown=node:node docker/healthcheck.mjs ./healthcheck.mjs
COPY --chown=node:node LICENSE ./LICENSE

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "healthcheck.mjs"]

CMD ["node", "dist/main.js"]
