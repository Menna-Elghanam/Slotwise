import Stripe from "stripe";
import { config } from "./config.js";

// One shared client. Pinning the API version means a Stripe dashboard upgrade can't change
// the shape of responses and webhook events underneath us.
export const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
  apiVersion: "2026-09-30.endive",
});
