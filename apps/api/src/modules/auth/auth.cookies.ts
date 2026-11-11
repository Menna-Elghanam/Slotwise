import type { CookieOptions, Request, Response } from "express";
import { config } from "../../lib/config.js";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS, type AuthTokens } from "./auth.service.js";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const baseOptions: CookieOptions = {
  httpOnly: true, // not readable from browser JavaScript, so XSS can't steal it
  secure: config.NODE_ENV === "production", // HTTPS only in production
  sameSite: "lax", // not sent on cross-site POSTs, which blocks CSRF
};

// The refresh token is only needed by the auth routes, so it isn't sent anywhere else.
// Behind the web app's proxy the browser sees those routes under /api/auth.
const refreshOptions: CookieOptions = { ...baseOptions, path: `${config.API_PATH_PREFIX}/auth` };

export function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...refreshOptions,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions);
  res.clearCookie(REFRESH_COOKIE, refreshOptions);
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = req.cookies[name];
  return typeof value === "string" ? value : undefined;
}
