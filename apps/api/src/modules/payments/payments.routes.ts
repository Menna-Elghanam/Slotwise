import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { createCheckoutHandler } from "./payments.controller.js";

export const paymentsRouter = Router();

paymentsRouter.post("/bookings/:id/checkout", requireAuth, createCheckoutHandler);
