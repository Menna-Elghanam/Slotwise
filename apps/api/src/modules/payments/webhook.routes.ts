import express, { Router } from "express";
import { stripeWebhookHandler } from "./payments.controller.js";

export const webhookRouter = Router();

// Raw body, not JSON: the signature is computed over the exact bytes Stripe sent.
webhookRouter.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);
