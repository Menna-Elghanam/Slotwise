import { createHash, randomBytes } from "node:crypto";
import type {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "@booking/shared";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AuthTokenType } from "../../generated/prisma/client.js";
import { queueEmail } from "../../jobs/emails.js";
import { config } from "../../lib/config.js";
import { db, isUniqueViolation } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { EmailMessage } from "../../lib/mailer.js";
import { passwordResetEmail, verifyEmailEmail } from "../notifications/email-templates.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
/** How long after rotation a reused refresh token counts as a race between tabs, not theft. */
const REFRESH_REUSE_GRACE_MS = 10 * 1000;

// Compared against when the email doesn't exist, so "unknown email" and "wrong password"
// take the same time and can't be told apart.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password", config.BCRYPT_ROUNDS);

const userSelect = {
  id: true,
  email: true,
  name: true,
  isAdmin: true,
  emailVerifiedAt: true,
} as const;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  emailVerifiedAt: Date | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

const invalidRefreshToken = () =>
  new AppError(401, "INVALID_REFRESH_TOKEN", "Session expired, please log in again");

const invalidLinkToken = () =>
  new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired");

// Tokens are long random strings, so a fast hash is enough (unlike human-chosen passwords).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A random token for a cookie or link; only its hash is stored, so a database leak can't use it. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

async function issueTokens(userId: string): Promise<AuthTokens> {
  const refreshToken = generateToken();
  await db.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  const accessToken = jwt.sign({}, config.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

  return { accessToken, refreshToken };
}

async function createAuthToken(userId: string, type: AuthTokenType, ttlMs: number) {
  const token = generateToken();
  await db.authToken.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/**
 * Marks a one-time link token as used and returns its user id. Conditional, so the same
 * link can't be used twice, even by two parallel requests.
 */
async function consumeAuthToken(token: string, type: AuthTokenType): Promise<string> {
  const stored = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.type !== type) {
    throw invalidLinkToken();
  }
  const { count } = await db.authToken.updateMany({
    where: { id: stored.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0) {
    throw invalidLinkToken();
  }
  return stored.userId;
}

/** Email failures are logged, not thrown: the account change itself already succeeded. */
async function queueAuthEmail(message: EmailMessage, userId: string): Promise<void> {
  await queueEmail(message).catch((err: unknown) => {
    logger.error({ err, userId }, "Could not queue auth email");
  });
}

async function sendVerificationEmail(user: { id: string; email: string; name: string }) {
  const token = await createAuthToken(user.id, "VERIFY_EMAIL", VERIFY_EMAIL_TTL_MS);
  await queueAuthEmail(verifyEmailEmail(user.email, user.name, token), user.id);
}

export async function register(input: RegisterInput) {
  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);

  try {
    const user = await db.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: userSelect,
    });
    await sendVerificationEmail(user);
    return { user: toPublicUser(user), tokens: await issueTokens(user.id) };
  } catch (err) {
    // Let the unique index decide instead of checking first: two parallel sign-ups
    // with the same email could both pass a check.
    if (isUniqueViolation(err)) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await db.user.findUnique({ where: { email: input.email } });
  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  return { user: toPublicUser(user), tokens: await issueTokens(user.id) };
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const stored = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });

  if (!stored || stored.expiresAt <= new Date()) {
    throw invalidRefreshToken();
  }

  if (stored.revokedAt) {
    // Two tabs can refresh at the same moment with the same cookie; the slower request
    // arrives just after the first one rotated it. That isn't theft: refuse this request,
    // but leave the sessions alone (the browser already has the new cookie).
    if (Date.now() - stored.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) {
      throw invalidRefreshToken();
    }
    // A revoked token being used again later means someone else has a copy: end every session.
    await db.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw invalidRefreshToken();
  }

  // Conditional update so two parallel refreshes with the same token can't both succeed.
  const { count } = await db.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) {
    throw invalidRefreshToken();
  }

  return issueTokens(stored.userId);
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) {
    return;
  }
  await db.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Returns the user id from a valid access token. */
export function verifyAccessToken(token: string): string {
  try {
    // Pin the algorithm so a token can't pick a weaker one for itself.
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub) {
      throw new Error("Malformed token payload");
    }
    return payload.sub;
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "You need to log in");
  }
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await db.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "You need to log in");
  }
  return toPublicUser(user);
}

export async function verifyEmail(input: VerifyEmailInput): Promise<void> {
  const userId = await consumeAuthToken(input.token, "VERIFY_EMAIL");
  await db.user.updateMany({
    where: { id: userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
}

export async function resendVerificationEmail(userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) {
    throw new AppError(409, "ALREADY_VERIFIED", "Your email address is already confirmed");
  }
  await sendVerificationEmail(user);
}

/**
 * Looks the same to the caller whether or not the account exists, so it can't be used
 * to find out which email addresses are registered.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  const token = await createAuthToken(user.id, "RESET_PASSWORD", RESET_PASSWORD_TTL_MS);
  await queueAuthEmail(passwordResetEmail(user.email, user.name, token), user.id);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const userId = await consumeAuthToken(input.token, "RESET_PASSWORD");
  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
  const now = new Date();

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Whoever knew the old password may still be logged in somewhere: end every session.
    db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    // Older reset links stop working too.
    db.authToken.updateMany({
      where: { userId, type: "RESET_PASSWORD", usedAt: null },
      data: { usedAt: now },
    }),
  ]);
}
