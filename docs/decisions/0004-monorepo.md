# 0004 — A pnpm monorepo with a shared Zod package

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The web app and the API must agree on every request shape. Keeping two copies of the
validation rules in sync by hand is how bugs like "the form allows it, the API rejects it"
happen.

## Decision

- **pnpm workspaces:** `apps/web`, `apps/api`, `packages/shared`.
- `packages/shared` holds the **Zod schemas** for request bodies and queries, plus their
  inferred TypeScript types. The API validates with them; the web app will use the same
  schemas in React Hook Form.
- The API's OpenAPI document is generated from the same schemas (`z.toJSONSchema`), and a
  test checks that every registered route is documented.
- pnpm over npm: strict dependency resolution (no "phantom" imports of packages you never
  declared) and good workspace support.
- The shared package is consumed as TypeScript source (no build step). The API runs with
  `tsx` in development and production.

## Alternatives considered

- **Two repositories:** schemas would have to be published as a package and versioned.
- **Turborepo / Nx:** useful caching for big repos; unnecessary at this size.
- **Compiling the API to JavaScript:** would need the shared package built too (or a
  bundler). Running through `tsx` costs a little startup time and memory, and avoids a
  build pipeline for v1.

## Consequences

- One change to a schema updates validation, types and docs together.
- Production depends on `tsx`. If startup time or memory ever matters, add a bundling step
  (e.g. esbuild) that inlines the shared package.
