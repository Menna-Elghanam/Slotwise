import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@booking/shared";
import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from "./auth.cookies.js";
import { getUserId } from "./auth.middleware.js";
import * as authService from "./auth.service.js";

export async function registerHandler(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const { user, tokens } = await authService.register(input);
  setAuthCookies(res, tokens);
  res.status(201).json({ user });
}

export async function loginHandler(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login(input);
  setAuthCookies(res, tokens);
  res.json({ user });
}

export async function refreshHandler(req: Request, res: Response) {
  const refreshToken = readCookie(req, REFRESH_COOKIE);
  if (!refreshToken) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Session expired, please log in again");
  }
  const tokens = await authService.refresh(refreshToken);
  setAuthCookies(res, tokens);
  res.status(204).end();
}

export async function logoutHandler(req: Request, res: Response) {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  clearAuthCookies(res);
  res.status(204).end();
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.getCurrentUser(getUserId(req));
  res.json({ user });
}

export async function verifyEmailHandler(req: Request, res: Response) {
  await authService.verifyEmail(verifyEmailSchema.parse(req.body));
  res.status(204).end();
}

export async function resendVerificationHandler(req: Request, res: Response) {
  await authService.resendVerificationEmail(getUserId(req));
  res.status(204).end();
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  res.status(204).end();
}

export async function resetPasswordHandler(req: Request, res: Response) {
  await authService.resetPassword(resetPasswordSchema.parse(req.body));
  // Every session was ended, including this browser's.
  clearAuthCookies(res);
  res.status(204).end();
}
