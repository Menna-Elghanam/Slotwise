import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  archiveServiceHandler,
  createServiceHandler,
  listServicesHandler,
  updateServiceHandler,
} from "./services.controller.js";

export const servicesRouter = Router();

// Nested under a business when creating or listing; flat once a service has its own id.
servicesRouter.get("/businesses/:businessId/services", listServicesHandler);
servicesRouter.post("/businesses/:businessId/services", requireAuth, createServiceHandler);
servicesRouter.patch("/services/:id", requireAuth, updateServiceHandler);
servicesRouter.delete("/services/:id", requireAuth, archiveServiceHandler);
