import {
  adminBusinessesQuerySchema,
  adminUsersQuerySchema,
  updateBusinessStatusSchema,
} from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import * as adminService from "./admin.service.js";

const idParamsSchema = z.object({ id: z.uuid() });

export async function statsHandler(_req: Request, res: Response) {
  res.json({ stats: await adminService.getStats() });
}

export async function listUsersHandler(req: Request, res: Response) {
  res.json(await adminService.listUsers(adminUsersQuerySchema.parse(req.query)));
}

export async function listBusinessesHandler(req: Request, res: Response) {
  res.json(await adminService.listBusinesses(adminBusinessesQuerySchema.parse(req.query)));
}

export async function updateBusinessStatusHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const { status } = updateBusinessStatusSchema.parse(req.body);
  res.json({ business: await adminService.setBusinessStatus(id, status) });
}
