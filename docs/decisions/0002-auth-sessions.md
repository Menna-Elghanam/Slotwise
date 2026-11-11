# 0002 — Our own auth: short JWTs and rotating refresh tokens in httpOnly cookies

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Users log in with email and password. The project is a learning portfolio piece, so the
auth should be built (not bought) and be explainable line by line, while following
current good practice.

## Decision

- Passwords hashed with **bcrypt** (`bcryptjs`, cost 12; 4 in tests only). Passwords are
  capped at 72 bytes because bcrypt ignores the rest.
- **Access token:** a JWT (HS256, algorithm pinned on verify) valid for 15 minutes.
- **Refresh token:** 32 random bytes, valid 7 days, stored only as a **SHA-256 hash**.
  Every refresh **rotates** it; using an already-rotated token again ends all of the user's
  sessions (reuse detection — someone else has a copy). Within **10 seconds** of rotation a
  reuse is treated as two tabs refreshing at once: that request is refused, but no sessions
  are ended (the browser already holds the new cookie).
- Both live in **httpOnly cookies** (JavaScript can't read them, so XSS can't steal them),
  `SameSite=Lax` (not sent on cross-site POSTs, which blocks CSRF), `Secure` in
  production. The refresh cookie is limited to the auth routes (`/auth`, or `/api/auth`
  behind the web app's proxy — `API_PATH_PREFIX`).
- Login takes the same time for "unknown email" and "wrong password" (a dummy hash is
  compared), and returns the same error, so accounts can't be discovered.
- Email links (verify email, reset password, staff invites) use the same pattern as
  refresh tokens: random token, only the hash stored, one-time use enforced by a
  conditional update, short expiry. A password reset ends every session.
- Admin rights are read from the database on each admin request, not from the token, so
  removing them takes effect immediately.

## Alternatives considered

- **A hosted provider (Auth0, Clerk):** less code, but nothing to learn or explain.
- **Tokens in `localStorage`:** readable by any script on the page.
- **Server-side sessions only:** simpler, but a database or Redis read on every request;
  the short-JWT approach only hits the database on refresh.

## Consequences

- The web app and API must be **same-site** for `SameSite=Lax` cookies to be sent. The
  Next.js app proxies `/api/*` to the API (rewrites), so the browser only
  ever talks to one origin. See [0009](0009-same-origin-api.md).
- A stolen access token works for at most 15 minutes; logout can't revoke it earlier.
- If a rotation's response is lost (network drop, navigation mid-request), the browser
  keeps the old token and the user has to log in again: only hashes are stored, so the
  server can't hand out the new token a second time. An accepted trade-off of rotation.
