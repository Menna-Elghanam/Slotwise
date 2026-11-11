import { Router } from "express";
import { getSlotsHandler } from "./slots.controller.js";

export const slotsRouter = Router();

// Public: customers browse free times before logging in.
slotsRouter.get("/businesses/:businessId/slots", getSlotsHandler);
