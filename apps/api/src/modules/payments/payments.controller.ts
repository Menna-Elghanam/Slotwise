import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getUserId } from "../auth/auth.middleware.js";
import * as paymentsService from "./payments.service.js";
import * as webhookService from "./webhook.service.js";

const idParamsSchema = z.object({ id: z.uuid() });

export async function stripeWebhookHandler(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) {
    throw new AppError(400, "INVALID_SIGNATURE", "Webhook signature verification failed");
  }
  const event = webhookService.verifyStripeEvent(req.body, signature);
  await webhookService.handleStripeEvent(event);
  res.json({ received: true });
}

export async function createCheckoutHandler(req: Request, res: Response) {
  const { id } = idParamsSchema.parse(req.params);
  const result = await paymentsService.createCheckout(id, getUserId(req));
  res.json(result);
}
