/**
 * Demo data for local development and the live demo: `pnpm --filter api db:seed`.
 * Safe to run twice: it stops if the demo accounts already exist. Every demo account uses
 * the password below.
 */
import { addDays, addMinutes, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import bcrypt from "bcryptjs";
import type { BusinessCategory } from "../generated/prisma/client.js";
import { config } from "../lib/config.js";
import { db } from "../lib/db.js";
import { localTimeToUtc } from "../modules/slots/slots.calculator.js";

export const DEMO_PASSWORD = "demo-password-123";

interface DemoBusiness {
  ownerEmail: string;
  ownerName: string;
  name: string;
  slug: string;
  category: BusinessCategory;
  description: string;
  address: string;
  services: { name: string; durationMinutes: number; bufferMinutes?: number; priceCents: number }[];
  /** Extra staff besides the owner. */
  staff: { email: string; name: string }[];
}

const businesses: DemoBusiness[] = [
  {
    ownerEmail: "owner@demo.local",
    ownerName: "Jonas Weber",
    name: "Kreuzberg Cuts",
    slug: "kreuzberg-cuts",
    category: "BARBER",
    description: "Classic cuts and beard care in the heart of Kreuzberg.",
    address: "Oranienstraße 12, 10999 Berlin",
    services: [
      { name: "Haircut", durationMinutes: 30, priceCents: 2500 },
      { name: "Beard trim", durationMinutes: 15, priceCents: 1200 },
      { name: "Cut and beard", durationMinutes: 45, bufferMinutes: 5, priceCents: 3200 },
    ],
    staff: [{ email: "barber@demo.local", name: "Mira Schulz" }],
  },
  {
    ownerEmail: "clinic@demo.local",
    ownerName: "Dr. Lena Hoffmann",
    name: "Smile Dental Clinic",
    slug: "smile-dental-clinic",
    category: "CLINIC",
    description: "Check-ups and cleanings with no long waits.",
    address: "Kastanienallee 5, 10435 Berlin",
    services: [
      { name: "Check-up", durationMinutes: 30, bufferMinutes: 10, priceCents: 6000 },
      { name: "Teeth cleaning", durationMinutes: 60, bufferMinutes: 10, priceCents: 9000 },
    ],
    staff: [],
  },
  {
    ownerEmail: "tutor@demo.local",
    ownerName: "Sara Klein",
    name: "Maths with Sara",
    slug: "maths-with-sara",
    category: "TUTOR",
    description: "One-to-one maths tutoring for school and university.",
    address: "Online or Bergmannstraße 3, 10961 Berlin",
    services: [{ name: "Tutoring session", durationMinutes: 60, priceCents: 4500 }],
    staff: [],
  },
];

/** Monday to Friday 09:00–18:00, Saturday 10:00–14:00 (local time). */
const weekHours = [
  ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1080 })),
  { dayOfWeek: 6, startMinute: 600, endMinute: 840 },
];

const TIMEZONE = "Europe/Berlin";

async function main() {
  if (await db.user.findUnique({ where: { email: "owner@demo.local" } })) {
    console.log("Demo data already exists; nothing to do.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.BCRYPT_ROUNDS);
  const verified = new Date();
  const user = (email: string, name: string, isAdmin = false) =>
    db.user.create({ data: { email, name, passwordHash, isAdmin, emailVerifiedAt: verified } });

  await user("admin@demo.local", "Platform Admin", true);
  const customer = await user("customer@demo.local", "Alex Customer");

  for (const demo of businesses) {
    const owner = await user(demo.ownerEmail, demo.ownerName);
    const business = await db.business.create({
      data: {
        ownerId: owner.id,
        name: demo.name,
        slug: demo.slug,
        category: demo.category,
        description: demo.description,
        address: demo.address,
        timezone: TIMEZONE,
      },
    });
    const services = await Promise.all(
      demo.services.map((service) =>
        db.service.create({ data: { ...service, businessId: business.id } }),
      ),
    );

    const people = [owner, ...(await Promise.all(demo.staff.map((s) => user(s.email, s.name))))];
    for (const person of people) {
      await db.staffMember.create({
        data: {
          businessId: business.id,
          userId: person.id,
          services: { create: services.map((service) => ({ serviceId: service.id })) },
          workingHours: { create: weekHours },
        },
      });
    }
  }

  await seedCustomerBookings(customer.id);
  console.log(
    `Demo data created. Log in with any *@demo.local account, password "${DEMO_PASSWORD}".`,
  );
}

/** One upcoming and one past booking at the barber, so both dashboards have something. */
async function seedCustomerBookings(customerId: string) {
  const staff = await db.staffMember.findFirstOrThrow({
    where: { user: { email: "owner@demo.local" } },
  });
  const haircut = await db.service.findFirstOrThrow({
    where: { name: "Haircut", business: { slug: "kreuzberg-cuts" } },
  });

  const nextWeekday = (from: Date, direction: 1 | -1) => {
    let day = from;
    do {
      day = direction === 1 ? addDays(day, 1) : subDays(day, 1);
    } while ([0, 6].includes(Number(formatInTimeZone(day, TIMEZONE, "i")) % 7));
    return formatInTimeZone(day, TIMEZONE, "yyyy-MM-dd");
  };

  const bookings = [
    { date: nextWeekday(addDays(new Date(), 2), 1), status: "CONFIRMED" as const },
    { date: nextWeekday(new Date(), -1), status: "COMPLETED" as const },
  ];
  for (const { date, status } of bookings) {
    const startsAt = localTimeToUtc(date, 600, TIMEZONE);
    const endsAt = addMinutes(startsAt, haircut.durationMinutes);
    await db.booking.create({
      data: {
        customerId,
        businessId: haircut.businessId,
        serviceId: haircut.id,
        staffId: staff.id,
        startsAt,
        endsAt,
        blockedUntil: addMinutes(endsAt, haircut.bufferMinutes),
        durationMinutes: haircut.durationMinutes,
        bufferMinutes: haircut.bufferMinutes,
        priceCents: haircut.priceCents,
        currency: haircut.currency,
        status,
      },
    });
  }
}

await main();
await db.$disconnect();
