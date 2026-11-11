# Product Spec — Booking Platform (v1)

A web platform where small businesses (clinics, barbers, tutors, gyms) publish their services and staff availability, and customers book and pay for appointments online.

## 1. Users and roles

Everyone signs up as a regular **user**. Additional roles come from context rather than from a single global role, so one account can be a customer at one business and staff at another.

| Role         | How you get it                              | Can do                                                                                                          |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Customer** | Any logged-in user                          | Browse businesses, book, pay, cancel and reschedule their own bookings                                          |
| **Owner**    | Creates a business (max one per user in v1) | Manage the business page, services, staff, working hours, settings; see and cancel all bookings of the business |
| **Staff**    | Accepts an email invite from an owner       | See own schedule, manage own working hours and time off, mark bookings completed / no-show                      |
| **Admin**    | Global flag set in the database             | See all businesses, users and bookings; suspend a business                                                      |

Rules:

- A business has exactly one owner.
- An owner can add themselves as a staff member (e.g. a solo barber).
- A staff member belongs to one business per invite; a user may be staff at several businesses.

## 2. Core features

1. **Auth** — register, email verification, login, logout, refresh tokens, password reset.
2. **Business management** — name, description, category, address, timezone, logo/cover image, booking settings.
3. **Services** — name, description, duration (minutes), price, optional buffer time after the service. Owner assigns which staff perform each service.
4. **Staff** — invite by email, assign services, deactivate.
5. **Availability** — weekly working hours per staff member (multiple ranges per day, e.g. 09:00–13:00 and 14:00–18:00) plus time-off date ranges.
6. **Slot calculation** — available start times for a service + staff (or "any staff") on a given date.
7. **Booking** — pick service → staff (or any) → date → slot → pay. Guaranteed no double-booking under concurrent requests.
8. **Payments** — Stripe Checkout (test mode), confirmed via webhooks; refunds on eligible cancellations.
9. **Cancellation and rescheduling** — subject to the business's cutoff.
10. **Emails** — booking confirmation, cancellation/reschedule notice, reminder 24h before.
11. **Dashboards** — customer ("my bookings"), staff (schedule), owner (business bookings and setup), admin.
12. **Discovery** — public list of businesses with search by name and filter by category.

## 3. Main user flows

### 3.1 Owner sets up a business

1. Registers and verifies email.
2. Creates a business (details, timezone, images).
3. Adds services.
4. Invites staff (and/or adds themselves as staff) and assigns services.
5. Sets working hours per staff member.
6. Business is publicly listed once it has at least one service with at least one staff member who has working hours.

### 3.2 Customer books an appointment

1. Browses or searches businesses and opens a business page.
2. Picks a service, then a staff member or "any available".
3. Picks a date and sees available slots (shown in the business's timezone).
4. Picks a slot → must be logged in → a **pending** booking is created that holds the slot.
5. Redirected to Stripe Checkout.
6. Stripe webhook confirms payment → booking becomes **confirmed** → confirmation email sent.
7. If payment isn't completed within 10 minutes, the pending booking **expires** and the slot is released.

### 3.3 Customer cancels or reschedules

1. Opens "my bookings".
2. Before the cutoff: cancel (full refund) or reschedule to another slot of the same service.
3. After the cutoff: both actions are disabled.

### 3.4 Staff manages their day

1. Sees today's and upcoming bookings.
2. Marks past bookings as **completed** or **no-show**.
3. Adds time off.

### 3.5 Owner cancels a booking

Owner (or staff) cancels any upcoming booking at any time → customer gets a full refund and an email.

## 4. Business rules

### Time and timezones

- Each business has one IANA timezone (e.g. `Europe/Berlin`).
- All timestamps are stored in UTC; working hours are stored as local wall-clock times and converted using the business timezone, so they stay correct across daylight-saving changes.

### Slots

- Slots start on a fixed **15-minute grid** (09:00, 09:15, 09:30, …).
- A slot is available for a staff member if the full interval `[start, start + duration + buffer)` is:
  - inside one of their working-hour ranges for that day,
  - not overlapping their time off,
  - not overlapping any of their **pending** or **confirmed** bookings (including those bookings' buffers).
- **Booking window:** from now + minimum notice (default 2 hours) up to max days ahead (default 60). Both configurable per business.
- **"Any available staff":** a slot is shown if at least one eligible staff member is free; on booking, the system assigns one of them.

### Bookings

- Capacity is always 1: one staff member, one customer, one booking per time interval.
- Two overlapping active bookings for the same staff member must be impossible, even with simultaneous requests. This is enforced at the database level, not only in application code.
- Price and duration are copied onto the booking when it's created, so later service edits don't change existing bookings.
- Bookings are confirmed instantly on successful payment; no owner approval.

### Booking statuses

```
PENDING ──payment ok──▶ CONFIRMED ──▶ COMPLETED
   │                        │    └──▶ NO_SHOW
   │                        └──▶ CANCELLED
   └──10 min, no payment──▶ EXPIRED
```

- Only `PENDING` and `CONFIRMED` block a slot.
- Rescheduling keeps the same booking (and payment) and moves its time.

### Cancellation and refunds

- **Customer:** free cancellation up to the cutoff before start (default 24h, configurable per business) → full refund. After the cutoff: no cancellation, no refund.
- **Business (owner/staff):** can cancel anytime → full refund.
- **Rescheduling:** same cutoff as cancellation; same service only; no price difference.

### Payments

- Full prepayment through Stripe Checkout; no pay-at-venue in v1.
- A booking is confirmed only by the Stripe webhook, never by the browser redirect.
- Webhook handling is idempotent (the same event delivered twice has no extra effect).

### Emails

- Confirmation on `CONFIRMED`.
- Notice on cancellation and reschedule.
- Reminder 24h before start (rescheduled bookings get their reminder moved; cancelled ones get it removed).

### Admin

- A suspended business is hidden from discovery and can't take new bookings; existing bookings stay visible.

## 5. Out of scope for v1

- Mobile app
- Multi-language
- SMS notifications
- Microservices
- Group bookings / classes (capacity > 1)
- Guest checkout (an account is required)
- Pay at venue, deposits, partial refunds, cancellation fees
- Multiple owners per business or multiple businesses per owner
- Reviews and ratings
- Maps and location-based search
- Recurring bookings
- Analytics and reports
- Calendar sync (Google/Outlook)
