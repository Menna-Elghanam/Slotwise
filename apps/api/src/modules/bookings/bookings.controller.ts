import {
  bookingOutcomeSchema,
  createBookingSchema,
  myBookingsQuerySchema,
  rescheduleBookingSchema,
  staffBookingsQuerySchema,
} from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { getUserId } from "../auth/auth.middleware.js";
import * as bookingsService from "./bookings.service.js";

const idParamsSchema = z.object({ id: z.uuid() });

export async function createBookingHandler(req: Request, res: Response) {
  const input = createBookingSchema.parse(req.body);
  const booking = await bookingsService.createBooking(getUserId(req), input);
  res.status(201).json({ booking });
}

export async function listMyBookingsHandler(req: Request, res: Response) {
  const query = myBookingsQuerySchema.parse(req.query);
  const bookings = await bookingsService.listMyBookings(getUserId(req), query);
  res.json({ bookings });
}

export async function listStaffBookingsHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const query = staffBookingsQuerySchema.parse(req.query);
  const bookings = await bookingsService.listStaffBookings(id, getUserId(req), query);
  res.json({ bookings });
}

export async function cancelBookingHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const booking = await bookingsService.cancelBooking(id, getUserId(req));
  res.json({ booking });
}

export async function rescheduleBookingHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const input = rescheduleBookingSchema.parse(req.body);
  const booking = await bookingsService.rescheduleBooking(id, getUserId(req), input);
  res.json({ booking });
}

export async function recordOutcomeHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const input = bookingOutcomeSchema.parse(req.body);
  const booking = await bookingsService.recordBookingOutcome(id, getUserId(req), input);
  res.json({ booking });
}

export async function getBookingHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const booking = await bookingsService.getBooking(id, getUserId(req));
  res.json({ booking });
}
