/**
 * Shapes of the API's JSON responses. Request shapes come from `@booking/shared` (the same
 * Zod schemas the API validates with); these are the answers. Dates arrive as ISO strings.
 */
import type { BookingStatus } from "@booking/shared";

export type { BookingStatus };
export type BusinessCategory = "CLINIC" | "BARBER" | "TUTOR" | "GYM" | "OTHER";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  emailVerified: boolean;
}

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: BusinessCategory;
  address: string;
  timezone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  cancelCutoffHours: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
}

export interface PublicStaff {
  id: string;
  name: string;
  serviceIds: string[];
}

export interface Slot {
  startsAt: string;
  /** Staff members free at this time. */
  staffIds: string[];
}

export interface SlotsResponse {
  date: string;
  timezone: string;
  slots: Slot[];
}

export interface Booking {
  id: string;
  customerId: string;
  businessId: string;
  serviceId: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  status: BookingStatus;
  /** When an unpaid booking stops holding its slot. */
  expiresAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface BookingBusiness {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  address: string;
  cancelCutoffHours: number;
  maxDaysAhead: number;
}

/** A booking as its customer sees it in "My bookings". */
export interface CustomerBooking extends Booking {
  business: BookingBusiness;
  service: { name: string };
  payment: { status: PaymentStatus } | null;
  staffName: string;
}

export interface BookingDetail extends CustomerBooking {
  customer: { name: string; email: string };
  viewer: "customer" | "business";
}

/** A booking in a staff member's schedule. */
export interface StaffBooking extends Booking {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  payment: { status: PaymentStatus } | null;
}

export interface OwnerService extends PublicService {
  bufferMinutes: number;
}

export interface TeamMember {
  id: string;
  isActive: boolean;
  isOwner: boolean;
  name: string;
  email: string;
  serviceIds: string[];
}

export interface OwnedBusiness extends PublicBusiness {
  status: "ACTIVE" | "SUSPENDED";
  services: OwnerService[];
  staff: TeamMember[];
}

export interface Workspace {
  business: OwnedBusiness | null;
  staffMemberships: {
    staffId: string;
    business: { id: string; name: string; slug: string; timezone: string };
  }[];
}

export interface WorkingHoursRange {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface TimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface StaffInvite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface ImageUpload {
  uploadUrl: string;
  fields: Record<string, string>;
}

export interface AdminStats {
  users: number;
  businesses: Partial<Record<"ACTIVE" | "SUSPENDED", number>>;
  bookings: Partial<Record<BookingStatus, number>>;
  paidCents: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  category: BusinessCategory;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  owner: { id: string; email: string; name: string };
  _count: { bookings: number; staff: number };
}
