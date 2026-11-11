import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  cancelBookingHandler,
  createBookingHandler,
  getBookingHandler,
  listMyBookingsHandler,
  listStaffBookingsHandler,
  recordOutcomeHandler,
  rescheduleBookingHandler,
} from "./bookings.controller.js";

export const bookingsRouter = Router();

bookingsRouter.post("/bookings", requireAuth, createBookingHandler);
bookingsRouter.get("/bookings/me", requireAuth, listMyBookingsHandler);
bookingsRouter.get("/bookings/:id", requireAuth, getBookingHandler);
bookingsRouter.post("/bookings/:id/cancel", requireAuth, cancelBookingHandler);
bookingsRouter.post("/bookings/:id/reschedule", requireAuth, rescheduleBookingHandler);
bookingsRouter.post("/bookings/:id/outcome", requireAuth, recordOutcomeHandler);
bookingsRouter.get("/staff/:id/bookings", requireAuth, listStaffBookingsHandler);
