# API image for Railway/Render. Build from the repository root (it needs the workspace):
#   docker build -f apps/api/Dockerfile -t booking-api .
FROM node:22-alpine

# pnpm, in the exact version from package.json's "packageManager".
RUN corepack enable
WORKDIR /app

# Dependencies first: this layer is cached until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Only the API and what it depends on (the shared package), not the web app.
RUN pnpm install --frozen-lockfile --filter "@booking/api..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# `prisma generate` loads prisma.config.ts, which needs some DATABASE_URL; it doesn't connect.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @booking/api db:generate

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 4000

# Apply pending migrations, then start. Fine for one instance; with several, run migrations
# as a separate release step so two instances don't race.
CMD ["sh", "-c", "pnpm db:deploy && pnpm start"]
