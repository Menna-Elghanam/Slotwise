import request from "supertest";
import { createApp } from "../app.js";

export const app = createApp();

export const berlinBarbers = {
  name: "Berlin Barbers",
  category: "BARBER",
  address: "Main St 1",
  timezone: "Europe/Berlin",
};

/** A supertest agent that keeps the auth cookies of a freshly registered user. */
export async function loggedInAgent(email: string) {
  const agent = request.agent(app);
  await agent
    .post("/auth/register")
    .send({ name: "Owner", email, password: "correct-horse-battery" });
  return agent;
}

/** Owner with a business, one 30-min service, and themselves as staff. */
export async function soloBusiness(
  email = "owner@example.com",
  data: Record<string, unknown> = berlinBarbers,
) {
  const { agent, business } = await createBusiness(email, data);
  const serviceRes = await agent
    .post(`/businesses/${business.id}/services`)
    .send({ name: "Haircut", durationMinutes: 30, priceCents: 2500 });
  const staffRes = await agent.post(`/businesses/${business.id}/staff/me`);
  const { service } = serviceRes.body as { service: { id: string } };
  const { staff } = staffRes.body as { staff: { id: string } };
  return { agent, business, service, staff };
}

export const mondayNineToTen = [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }];

/** Solo business whose owner performs the 30-min haircut on Mondays 09:00–10:00 (Berlin). */
export async function bookableBusiness(
  email = "owner@example.com",
  data: Record<string, unknown> = berlinBarbers,
) {
  const setup = await soloBusiness(email, data);
  await setup.agent
    .put(`/staff/${setup.staff.id}/services`)
    .send({ serviceIds: [setup.service.id] });
  await setup.agent.put(`/staff/${setup.staff.id}/working-hours`).send({ ranges: mondayNineToTen });
  return setup;
}

/** Endpoints use the real clock, so pick a Monday safely inside the booking window. */
export function upcomingMonday(): string {
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  while (day.getUTCDay() !== 1) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return day.toISOString().slice(0, 10);
}

/** Registers `email` and creates a business they own. */
export async function createBusiness(email: string, data: Record<string, unknown> = berlinBarbers) {
  const agent = await loggedInAgent(email);
  const res = await agent.post("/businesses").send(data);
  const { business } = res.body as { business: { id: string; slug: string } };
  return { agent, business };
}
