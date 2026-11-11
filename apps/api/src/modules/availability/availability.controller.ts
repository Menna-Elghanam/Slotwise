import { createTimeOffSchema, setWorkingHoursSchema } from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { getUserId } from "../auth/auth.middleware.js";
import * as availabilityService from "./availability.service.js";

const idParamsSchema = z.object({ id: z.uuid() });

export async function getWorkingHoursHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const ranges = await availabilityService.getWorkingHours(id);
  res.json({ ranges });
}

export async function setWorkingHoursHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const { ranges } = setWorkingHoursSchema.parse(req.body);
  const saved = await availabilityService.setWorkingHours(id, getUserId(req), ranges);
  res.json({ ranges: saved });
}

export async function listTimeOffHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const timeOff = await availabilityService.listTimeOff(id, getUserId(req));
  res.json({ timeOff });
}

export async function createTimeOffHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const input = createTimeOffSchema.parse(req.body);
  const timeOff = await availabilityService.createTimeOff(id, getUserId(req), input);
  res.status(201).json({ timeOff });
}

export async function deleteTimeOffHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  await availabilityService.deleteTimeOff(id, getUserId(req));
  res.status(204).end();
}
