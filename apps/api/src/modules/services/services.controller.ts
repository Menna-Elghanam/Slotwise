import { createServiceSchema, updateServiceSchema } from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { getUserId } from "../auth/auth.middleware.js";
import * as servicesService from "./services.service.js";

const businessParamsSchema = z.object({ businessId: z.uuid() });
const serviceParamsSchema = z.object({ id: z.uuid() });

export async function createServiceHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const input = createServiceSchema.parse(req.body);
  const service = await servicesService.createService(businessId, getUserId(req), input);
  res.status(201).json({ service });
}

export async function listServicesHandler(req: Request, res: Response) {
  const { businessId } = businessParamsSchema.parse(req.params);
  const services = await servicesService.listActiveServices(businessId);
  res.json({ services });
}

export async function updateServiceHandler(req: Request, res: Response) {
  const { id } = serviceParamsSchema.parse(req.params);
  const input = updateServiceSchema.parse(req.body);
  const service = await servicesService.updateService(id, getUserId(req), input);
  res.json({ service });
}

export async function archiveServiceHandler(req: Request, res: Response) {
  const { id } = serviceParamsSchema.parse(req.params);
  await servicesService.archiveService(id, getUserId(req));
  res.status(204).end();
}
