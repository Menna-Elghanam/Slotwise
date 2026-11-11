import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  acceptInviteHandler,
  addSelfAsStaffHandler,
  inviteStaffHandler,
  listInvitesHandler,
  listStaffHandler,
  setStaffServicesHandler,
  updateStaffHandler,
} from "./staff.controller.js";

export const staffRouter = Router();

staffRouter.get("/businesses/:businessId/staff", listStaffHandler);
staffRouter.post("/businesses/:businessId/staff/me", requireAuth, addSelfAsStaffHandler);
staffRouter.put("/staff/:id/services", requireAuth, setStaffServicesHandler);
staffRouter.post("/businesses/:businessId/staff/invites", requireAuth, inviteStaffHandler);
staffRouter.get("/businesses/:businessId/staff/invites", requireAuth, listInvitesHandler);
staffRouter.post("/staff/invites/accept", requireAuth, acceptInviteHandler);
staffRouter.patch("/staff/:id", requireAuth, updateStaffHandler);
