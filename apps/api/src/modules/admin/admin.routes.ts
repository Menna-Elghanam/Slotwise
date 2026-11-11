import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/auth.middleware.js";
import {
  listBusinessesHandler,
  listUsersHandler,
  statsHandler,
  updateBusinessStatusHandler,
} from "./admin.controller.js";

export const adminRouter = Router();

// Every admin route needs a logged-in admin.
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/stats", statsHandler);
adminRouter.get("/users", listUsersHandler);
adminRouter.get("/businesses", listBusinessesHandler);
adminRouter.patch("/businesses/:id", updateBusinessStatusHandler);
