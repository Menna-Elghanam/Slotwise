import { slotsQuerySchema } from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import * as slotsService from "./slots.service.js";

const businessParamsSchema = z.object({ businessId: z.uuid() });

export async function getSlotsHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const query = slotsQuerySchema.parse(req.query);
  res.json(await slotsService.getAvailableSlots(businessId, query));
}
