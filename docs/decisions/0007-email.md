# 0007 — Email with Nodemailer over SMTP, Mailpit locally

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The platform sends booking confirmations, reminders 24 hours before, cancellations,
reschedule notices, email verification, password resets and staff invites. Development
must work without signing up for anything, and no test may send a real email.

## Decision

- **Nodemailer** with one `SMTP_URL`. Any provider works in production (Resend, Postmark,
  SES all offer SMTP); switching is a config change, not a code change.
- **Mailpit** in docker-compose catches every email locally: inbox at
  `http://localhost:8025`. `SMTP_URL` defaults to it.
- All emails go through the `emails` queue (see [0003](0003-job-queue.md)), so a slow or
  failing mail server never affects a request.
- **Plain text only** for v1: user-written values (names, business names) can't inject HTML
  into an email.
- Times are shown in the **business's** time zone, where the appointment happens.
- Tests read queued emails straight from the queue (no worker runs in tests), which also
  lets a test pick the token out of a "verify your email" email and use it like a user.

## Alternatives considered

- **Resend's HTTP SDK:** nice API, but ties the code to one provider and needs an account
  even for local development.
- **HTML templates (React Email, MJML):** nicer looking; worth adding later with proper
  escaping.

## Consequences

- Email content (including login links) sits in Redis until sent; Redis must not be
  publicly reachable. Workers never log message contents.
