# 0009 — The web app proxies the API, so cookies stay same-site

- **Status:** Accepted (implemented; covered by an end-to-end test)
- **Date:** 2026-11-11

## Context

The web app will be on Vercel and the API on Railway or Render: two different sites. Auth
cookies are `SameSite=Lax` ([0002](0002-auth-sessions.md)), so a browser would not send
them on the web app's `fetch` calls to another site.

## Decision

The Next.js app **proxies** `/api/*` to the API with `rewrites` in `next.config.ts`. The
browser only ever talks to the web app's origin; the API's cookies become first-party.

- No CORS configuration is needed on the API (no cross-origin browser requests).
- `SameSite=Lax` keeps protecting against CSRF.
- Stripe redirects and email links point at `WEB_URL`, the web app.
- Public pages are rendered by server components that call the API directly over the
  server's network (`API_URL`), with no cookies involved.

**A detail found while building it:** the browser sees the API's routes under `/api`, so a
refresh cookie scoped to `Path=/auth` would never be sent to `/api/auth/refresh`. The API
takes `API_PATH_PREFIX=/api` and scopes the cookie to `/api/auth`. An end-to-end test
checks the cookie's path and that an expired access token is renewed through the proxy.

## Alternatives considered

- **`SameSite=None; Secure` cookies + CORS with credentials:** works across sites, but
  gives up the built-in CSRF protection, so CSRF tokens would be needed on every form.
- **A shared parent domain** (`app.example.com` + `api.example.com`): same-site without a
  proxy, but needs a custom domain for both hosts.

## Consequences

- Every browser API call goes through the web server: a small extra hop of latency.
- `API_URL` is read when `next build` runs (rewrites are compiled into the build).
- The API's rate limit sees requests arriving through the proxy. Set `TRUST_PROXY_HOPS` to
  the number of proxies in front of the API so it reads the visitor's IP from
  `X-Forwarded-For`; check the real chain once deployed.
- The Stripe webhook should be pointed at the API directly (it needs no cookies).
