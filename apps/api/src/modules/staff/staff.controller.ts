import {
  acceptStaffInviteSchema,
  createStaffInviteSchema,
  setStaffServicesSchema,
  updateStaffSchema,
} from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { getUserId } from "../auth/auth.middleware.js";
import * as staffService from "./staff.service.js";

const businessParamsSchema = z.object({ businessId: z.uuid() });
const staffParamsSchema = z.object({ id: z.uuid() });

export async function addSelfAsStaffHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const staff = await staffService.addOwnerAsStaff(businessId, getUserId(req));
  res.status(201).json({ staff });
}

export async function setStaffServicesHandler(req: Request, res: Response) {
  const { id } = staffParamsSchema.parse(req.params);
  const { serviceIds } = setStaffServicesSchema.parse(req.body);
  res.json(await staffService.setStaffServices(id, getUserId(req), serviceIds));
}

export async function listStaffHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const staff = await staffService.listActiveStaff(businessId);
  res.json({ staff });
}

export async function inviteStaffHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const { email } = createStaffInviteSchema.parse(req.body);
  const invite = await staffService.inviteStaff(businessId, getUserId(req), email);
  res.status(201).json({ invite });
}

export async function listInvitesHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const invites = await staffService.listPendingInvites(businessId, getUserId(req));
  res.json({ invites });
}

export async function acceptInviteHandler(req: Request, res: Response) {
  const { token } = acceptStaffInviteSchema.parse(req.body);
  const staff = await staffService.acceptInvite(token, getUserId(req));
  res.status(201).json({ staff });
}

export async function updateStaffHandler(req: Request, res: Response) {
  const { id } = staffParamsSchema.parse(req.params);
  const { isActive } = updateStaffSchema.parse(req.body);
  const staff = await staffService.setStaffActive(id, getUserId(req), isActive);
  res.json({ staff });
}
