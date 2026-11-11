import { formatInTimeZone } from "date-fns-tz";
import { config } from "../../lib/config.js";
import type { EmailMessage } from "../../lib/mailer.js";

export interface BookingEmailDetails {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  businessName: string;
  businessAddress: string;
  timezone: string;
  serviceName: string;
  staffName: string;
  startsAt: Date;
}

/** Shown in the business's own time zone, which is where the appointment happens. */
function when(details: BookingEmailDetails): string {
  const local = formatInTimeZone(details.startsAt, details.timezone, "EEEE d MMMM yyyy 'at' HH:mm");
  return `${local} (${details.timezone})`;
}

function bookingSummary(details: BookingEmailDetails): string {
  return [
    `Service: ${details.serviceName}`,
    `With: ${details.staffName}`,
    `When: ${when(details)}`,
    `Where: ${details.businessName}, ${details.businessAddress}`,
    "",
    `Manage your booking: ${config.WEB_URL}/bookings/${details.bookingId}`,
  ].join("\n");
}

export function bookingConfirmedEmail(details: BookingEmailDetails): EmailMessage {
  return {
    to: details.customerEmail,
    subject: `Booking confirmed: ${details.serviceName} at ${details.businessName}`,
    text: `Hi ${details.customerName},\n\nYour booking is confirmed.\n\n${bookingSummary(details)}\n`,
  };
}

export function bookingRescheduledEmail(details: BookingEmailDetails): EmailMessage {
  return {
    to: details.customerEmail,
    subject: `Booking moved: ${details.serviceName} at ${details.businessName}`,
    text: `Hi ${details.customerName},\n\nYour booking has a new time.\n\n${bookingSummary(details)}\n`,
  };
}

export function bookingReminderEmail(details: BookingEmailDetails): EmailMessage {
  return {
    to: details.customerEmail,
    subject: `Reminder: ${details.serviceName} tomorrow at ${details.businessName}`,
    text: `Hi ${details.customerName},\n\nA reminder of your booking.\n\n${bookingSummary(details)}\n`,
  };
}

export function bookingCancelledEmail(
  details: BookingEmailDetails,
  refunded: boolean,
): EmailMessage {
  const refund = refunded
    ? "\nYour payment will be refunded to your card within a few days.\n"
    : "";
  return {
    to: details.customerEmail,
    subject: `Booking cancelled: ${details.serviceName} at ${details.businessName}`,
    text: `Hi ${details.customerName},\n\nThis booking was cancelled:\n\nService: ${details.serviceName}\nWhen: ${when(details)}\n${refund}`,
  };
}

export function verifyEmailEmail(to: string, name: string, token: string): EmailMessage {
  return {
    to,
    subject: "Confirm your email address",
    text: `Hi ${name},\n\nConfirm your email address by opening this link (valid for 24 hours):\n\n${config.WEB_URL}/verify-email?token=${token}\n`,
  };
}

export function passwordResetEmail(to: string, name: string, token: string): EmailMessage {
  return {
    to,
    subject: "Reset your password",
    text: `Hi ${name},\n\nReset your password with this link (valid for 1 hour):\n\n${config.WEB_URL}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email.\n`,
  };
}

export function staffInviteEmail(to: string, businessName: string, token: string): EmailMessage {
  return {
    to,
    subject: `You're invited to join ${businessName}`,
    text: `Hi,\n\n${businessName} invited you to take bookings as a staff member.\nLog in or sign up with this email address, then open (valid for 7 days):\n\n${config.WEB_URL}/invites/accept?token=${token}\n`,
  };
}
