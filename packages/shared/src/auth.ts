import { z } from "zod";

// Normalise before validating so " Ali@Mail.com" and "ali@mail.com" are the same account.
const email = z.string().trim().toLowerCase().pipe(z.email());

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** One-time tokens from email links (verify email, reset password, staff invite). */
const emailToken = z.string().min(20).max(200);

export const verifyEmailSchema = z.object({ token: emailToken });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: emailToken,
  password: registerSchema.shape.password,
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
