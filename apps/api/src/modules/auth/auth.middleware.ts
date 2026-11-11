import type { Request, RequestHandler } from "express";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { ACCESS_COOKIE, readCookie } from "./auth.cookies.js";
import { verifyAccessToken } from "./auth.service.js";

const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "You need to log in");

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = readCookie(req, ACCESS_COOKIE);
  if (!token) {
    next(unauthenticated());
    return;
  }
  req.userId = verifyAccessToken(token);
  next();
};

/**
 * Use after `requireAuth`. Reads the flag from the database on every request rather than
 * from the token, so removing someone's admin rights takes effect immediately.
 */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const user = req.userId
    ? await db.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } })
    : null;
  if (!user?.isAdmin) {
    next(new AppError(403, "FORBIDDEN", "Admins only"));
    return;
  }
  next();
};

/** For handlers behind `requireAuth`: returns the logged-in user's id. */
export function getUserId(req: Request): string {
  if (!req.userId) {
    throw unauthenticated();
  }
  return req.userId;
}
