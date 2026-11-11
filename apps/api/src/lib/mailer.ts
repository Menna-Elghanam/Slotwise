import { createTransport } from "nodemailer";
import { config } from "./config.js";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text only for v1: nothing user-written can inject HTML into an email. */
  text: string;
}

const transport = createTransport(config.SMTP_URL);

export async function sendEmail(message: EmailMessage): Promise<void> {
  await transport.sendMail({ from: config.EMAIL_FROM, ...message });
}
