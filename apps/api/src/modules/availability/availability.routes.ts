import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createTimeOffHandler,
  deleteTimeOffHandler,
  getWorkingHoursHandler,
  listTimeOffHandler,
  setWorkingHoursHandler,
} from "./availability.controller.js";

export const availabilityRouter = Router();

// Opening hours are public; time off is private (reasons may be personal).
availabilityRouter.get("/staff/:id/working-hours", getWorkingHoursHandler);
availabilityRouter.put("/staff/:id/working-hours", requireAuth, setWorkingHoursHandler);
availabilityRouter.get("/staff/:id/time-off", requireAuth, listTimeOffHandler);
availabilityRouter.post("/staff/:id/time-off", requireAuth, createTimeOffHandler);
availabilityRouter.delete("/time-off/:id", requireAuth, deleteTimeOffHandler);
