# 0010 — Frontend: server components for public pages, TanStack Query for the rest

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The web app has two very different halves: public pages (home, directory, business page)
that should load fast and be indexable, and logged-in pages (bookings, dashboard, admin)
that are interactive and change data constantly.

## Decision

**Rendering**

- **Public pages are server components.** They fetch from the API on the server and send
  HTML. The directory's search is a plain GET form, so it works before JavaScript loads.
  They call `connection()` so `next build` doesn't prerender them with build-time data.
- **Logged-in pages are client components** using **TanStack Query**: caching, loading and
  error states, and invalidation after every change ("cancel" refreshes bookings lists and
  free slots).
- The booking widget is a client island inside the server-rendered business page.

**Auth in the browser**

- `RequireAuth` shows a page only to logged-in users and sends others to
  `/login?next=…`; `next` is checked to be a local path (no open redirect). The API still
  checks every request — the guard only avoids showing pages that can't work.
- When a request returns 401, the client refreshes the session **once** and retries. All
  requests failing at the same moment share that one refresh (a single in-flight promise):
  sending the same refresh token twice would look like token theft to the API. Two _tabs_
  racing are covered by the API's 10-second reuse grace ([0002](0002-auth-sessions.md)).

**Forms and validation**

- React Hook Form with `zodResolver` and the **same Zod schemas the API uses**
  (`@booking/shared`). If the API still rejects a field, its error is shown on that field.

**UI components**

- shadcn/ui-style: small components in the repo (`components/ui`), styled with Tailwind v4
  design tokens and `class-variance-authority`. Where the browser already does the job
  accessibly, native elements are used instead of a component library: `<dialog>` (focus
  trap, Escape, focus return), `<select>`, radio buttons and `<fieldset>`/`<legend>`.

**Time zones**

- Every time is shown in the **business's** time zone. Wall-clock inputs (time off) are
  converted with `fromZonedTime` before being sent as exact moments.

**State in the URL**

- The booking widget keeps service, staff and day in the query string, so a visitor who
  must log in first comes back to the same choice (tested end to end).

## Alternatives considered

- **Everything as server components + server actions:** less client JavaScript, but auth
  cookies belong to the API, so server actions would have to forward cookies and handle
  refresh on the server; a client data layer is simpler and easier to reason about here.
- **Generating the shadcn/ui components with its CLI:** would add Radix packages for
  dialogs and selects that native elements cover.
- **Typed API client generated from OpenAPI:** worth it once the API stabilises; for now
  response types are hand-written in `lib/types.ts`.

## Lessons recorded

- Turbopack doesn't map `.js` import specifiers to `.ts` files, so the shared package uses
  explicit `.ts` imports (`allowImportingTsExtensions`; nothing is emitted anyway).
- Grid and flex items, and `<fieldset>`, don't shrink below their content by default
  (`min-width: auto` / `min-content`). That made the page scroll sideways on phones; an
  end-to-end test now checks every main page at 390 px (WCAG 1.4.10 Reflow).

## Consequences

- Public pages are fast and work without JavaScript for browsing.
- Response types can drift from the API; the end-to-end tests catch the important flows.
