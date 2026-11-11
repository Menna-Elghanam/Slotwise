import { Router } from "express";
import { rateLimit } from "../../lib/rate-limit.js";
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resendVerificationHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

export const authRouter = Router();

// Stricter than the general limit: these are the routes password guessing and
// email spamming would use.
const sensitive = rateLimit({ name: "auth", limit: 10, windowSeconds: 60 });

authRouter.post("/register", sensitive, registerHandler);
authRouter.post("/login", sensitive, loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
authRouter.post("/verify-email", sensitive, verifyEmailHandler);
authRouter.post("/resend-verification", sensitive, requireAuth, resendVerificationHandler);
authRouter.post("/forgot-password", sensitive, forgotPasswordHandler);
authRouter.post("/reset-password", sensitive, resetPasswordHandler);
