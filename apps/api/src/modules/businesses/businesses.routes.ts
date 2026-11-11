import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createBusinessHandler,
  createImageUploadHandler,
  getBusinessHandler,
  listBusinessesHandler,
  updateBusinessHandler,
} from "./businesses.controller.js";

export const businessesRouter = Router();

// Public
businessesRouter.get("/", listBusinessesHandler);
businessesRouter.get("/:slug", getBusinessHandler);

// Logged in (ownership is checked in the service)
businessesRouter.post("/", requireAuth, createBusinessHandler);
businessesRouter.patch("/:id", requireAuth, updateBusinessHandler);
businessesRouter.post("/:id/image-uploads", requireAuth, createImageUploadHandler);
