import {
  createBusinessSchema,
  createImageUploadSchema,
  listBusinessesQuerySchema,
  updateBusinessSchema,
} from "@booking/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { getUserId } from "../auth/auth.middleware.js";
import * as businessesService from "./businesses.service.js";

// A non-UUID id would make Prisma throw (500), so reject it early as a 400.
const idParamsSchema = z.object({ id: z.uuid() });
const slugParamsSchema = z.object({ slug: z.string().min(1).max(100) });

export async function createBusinessHandler(req: Request, res: Response) {
  const input = createBusinessSchema.parse(req.body);
  const business = await businessesService.createBusiness(getUserId(req), input);
  res.status(201).json({ business });
}

export async function listBusinessesHandler(req: Request, res: Response) {
  const query = listBusinessesQuerySchema.parse(req.query);
  res.json(await businessesService.listBusinesses(query));
}

export async function getBusinessHandler(req: Request, res: Response) {
  const { slug } = slugParamsSchema.parse(req.params);
  const business = await businessesService.getBusinessBySlug(slug);
  res.json({ business });
}

export async function updateBusinessHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const input = updateBusinessSchema.parse(req.body);
  const business = await businessesService.updateBusiness(id, getUserId(req), input);
  res.json({ business });
}

export async function createImageUploadHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const { kind } = createImageUploadSchema.parse(req.body);
  res.json(await businessesService.createImageUpload(id, getUserId(req), kind));
}
