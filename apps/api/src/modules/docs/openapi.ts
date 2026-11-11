import {
  acceptStaffInviteSchema,
  adminBusinessesQuerySchema,
  adminUsersQuerySchema,
  bookingOutcomeSchema,
  createBookingSchema,
  createBusinessSchema,
  createImageUploadSchema,
  createServiceSchema,
  createStaffInviteSchema,
  createTimeOffSchema,
  forgotPasswordSchema,
  listBusinessesQuerySchema,
  loginSchema,
  myBookingsQuerySchema,
  registerSchema,
  rescheduleBookingSchema,
  resetPasswordSchema,
  setStaffServicesSchema,
  setWorkingHoursSchema,
  slotsQuerySchema,
  staffBookingsQuerySchema,
  updateBusinessSchema,
  updateBusinessStatusSchema,
  updateServiceSchema,
  updateStaffSchema,
  verifyEmailSchema,
} from "@booking/shared";
import { z } from "zod";

type Method = "get" | "post" | "put" | "patch" | "delete";
type Access = "public" | "user" | "admin";

interface Operation {
  method: Method;
  /** OpenAPI style: `/bookings/{id}`. */
  path: string;
  tag: string;
  summary: string;
  access: Access;
  body?: z.ZodType;
  query?: z.ZodObject;
  /** The success status; errors share one documented shape. */
  status?: 200 | 201 | 204;
}

/** Every route of the API. A test checks this list against the registered routes. */
export const operations: Operation[] = [
  { method: "get", path: "/health", tag: "System", summary: "Health check", access: "public" },

  {
    method: "post",
    path: "/auth/register",
    tag: "Auth",
    summary: "Sign up and log in",
    access: "public",
    body: registerSchema,
    status: 201,
  },
  {
    method: "post",
    path: "/auth/login",
    tag: "Auth",
    summary: "Log in (sets cookies)",
    access: "public",
    body: loginSchema,
  },
  {
    method: "post",
    path: "/auth/refresh",
    tag: "Auth",
    summary: "Rotate the session cookies",
    access: "public",
    status: 204,
  },
  {
    method: "post",
    path: "/auth/logout",
    tag: "Auth",
    summary: "Log out",
    access: "public",
    status: 204,
  },
  { method: "get", path: "/auth/me", tag: "Auth", summary: "The logged-in user", access: "user" },
  {
    method: "post",
    path: "/auth/verify-email",
    tag: "Auth",
    summary: "Confirm an email address with the emailed token",
    access: "public",
    body: verifyEmailSchema,
    status: 204,
  },
  {
    method: "post",
    path: "/auth/resend-verification",
    tag: "Auth",
    summary: "Send the confirmation email again",
    access: "user",
    status: 204,
  },
  {
    method: "post",
    path: "/auth/forgot-password",
    tag: "Auth",
    summary: "Email a password reset link (same answer for unknown emails)",
    access: "public",
    body: forgotPasswordSchema,
    status: 204,
  },
  {
    method: "post",
    path: "/auth/reset-password",
    tag: "Auth",
    summary: "Set a new password with the emailed token; ends all sessions",
    access: "public",
    body: resetPasswordSchema,
    status: 204,
  },

  {
    method: "get",
    path: "/businesses",
    tag: "Businesses",
    summary: "Discover bookable businesses",
    access: "public",
    query: listBusinessesQuerySchema,
  },
  {
    method: "get",
    path: "/businesses/{slug}",
    tag: "Businesses",
    summary: "A business page",
    access: "public",
  },
  {
    method: "post",
    path: "/businesses",
    tag: "Businesses",
    summary: "Create your business (one per owner)",
    access: "user",
    body: createBusinessSchema,
    status: 201,
  },
  {
    method: "patch",
    path: "/businesses/{id}",
    tag: "Businesses",
    summary: "Update your business",
    access: "user",
    body: updateBusinessSchema,
  },
  {
    method: "post",
    path: "/businesses/{id}/image-uploads",
    tag: "Businesses",
    summary: "Signed fields for a direct upload to Cloudinary",
    access: "user",
    body: createImageUploadSchema,
  },

  {
    method: "get",
    path: "/businesses/{businessId}/services",
    tag: "Services",
    summary: "A business's active services",
    access: "public",
  },
  {
    method: "post",
    path: "/businesses/{businessId}/services",
    tag: "Services",
    summary: "Add a service",
    access: "user",
    body: createServiceSchema,
    status: 201,
  },
  {
    method: "patch",
    path: "/services/{id}",
    tag: "Services",
    summary: "Update a service",
    access: "user",
    body: updateServiceSchema,
  },
  {
    method: "delete",
    path: "/services/{id}",
    tag: "Services",
    summary: "Archive a service",
    access: "user",
  },

  {
    method: "get",
    path: "/businesses/{businessId}/staff",
    tag: "Staff",
    summary: "A business's active staff",
    access: "public",
  },
  {
    method: "post",
    path: "/businesses/{businessId}/staff/me",
    tag: "Staff",
    summary: "Add yourself (the owner) as staff",
    access: "user",
    status: 201,
  },
  {
    method: "post",
    path: "/businesses/{businessId}/staff/invites",
    tag: "Staff",
    summary: "Invite a staff member by email",
    access: "user",
    body: createStaffInviteSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/businesses/{businessId}/staff/invites",
    tag: "Staff",
    summary: "Pending invites",
    access: "user",
  },
  {
    method: "post",
    path: "/staff/invites/accept",
    tag: "Staff",
    summary: "Join a business with an invite token",
    access: "user",
    body: acceptStaffInviteSchema,
    status: 201,
  },
  {
    method: "patch",
    path: "/staff/{id}",
    tag: "Staff",
    summary: "Activate or deactivate a staff member",
    access: "user",
    body: updateStaffSchema,
  },
  {
    method: "put",
    path: "/staff/{id}/services",
    tag: "Staff",
    summary: "Replace the services a staff member performs",
    access: "user",
    body: setStaffServicesSchema,
  },

  {
    method: "get",
    path: "/staff/{id}/working-hours",
    tag: "Availability",
    summary: "Weekly working hours",
    access: "public",
  },
  {
    method: "put",
    path: "/staff/{id}/working-hours",
    tag: "Availability",
    summary: "Replace the weekly working hours",
    access: "user",
    body: setWorkingHoursSchema,
  },
  {
    method: "get",
    path: "/staff/{id}/time-off",
    tag: "Availability",
    summary: "Upcoming time off",
    access: "user",
  },
  {
    method: "post",
    path: "/staff/{id}/time-off",
    tag: "Availability",
    summary: "Add time off",
    access: "user",
    body: createTimeOffSchema,
    status: 201,
  },
  {
    method: "delete",
    path: "/time-off/{id}",
    tag: "Availability",
    summary: "Remove time off",
    access: "user",
    status: 204,
  },
  {
    method: "get",
    path: "/businesses/{businessId}/slots",
    tag: "Availability",
    summary: "Free start times for a service on a day",
    access: "public",
    query: slotsQuerySchema,
  },

  {
    method: "post",
    path: "/bookings",
    tag: "Bookings",
    summary: "Book a slot (PENDING until paid)",
    access: "user",
    body: createBookingSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/bookings/{id}",
    tag: "Bookings",
    summary: "One booking, for its customer or the business side",
    access: "user",
  },
  {
    method: "get",
    path: "/bookings/me",
    tag: "Bookings",
    summary: "Your bookings",
    access: "user",
    query: myBookingsQuerySchema,
  },
  {
    method: "post",
    path: "/bookings/{id}/cancel",
    tag: "Bookings",
    summary: "Cancel (refunds a paid booking)",
    access: "user",
  },
  {
    method: "post",
    path: "/bookings/{id}/reschedule",
    tag: "Bookings",
    summary: "Move to another time",
    access: "user",
    body: rescheduleBookingSchema,
  },
  {
    method: "post",
    path: "/bookings/{id}/outcome",
    tag: "Bookings",
    summary: "Mark a past booking completed or no-show",
    access: "user",
    body: bookingOutcomeSchema,
  },
  {
    method: "get",
    path: "/staff/{id}/bookings",
    tag: "Bookings",
    summary: "A staff member's schedule",
    access: "user",
    query: staffBookingsQuerySchema,
  },

  {
    method: "post",
    path: "/bookings/{id}/checkout",
    tag: "Payments",
    summary: "Start or resume Stripe Checkout",
    access: "user",
  },
  {
    method: "post",
    path: "/webhooks/stripe",
    tag: "Payments",
    summary: "Stripe webhook (signature checked)",
    access: "public",
  },

  {
    method: "get",
    path: "/me/workspace",
    tag: "Auth",
    summary: "The business you own (with services and team) and where you work as staff",
    access: "user",
  },
  {
    method: "get",
    path: "/admin/stats",
    tag: "Admin",
    summary: "Platform numbers",
    access: "admin",
  },
  {
    method: "get",
    path: "/admin/users",
    tag: "Admin",
    summary: "All users",
    access: "admin",
    query: adminUsersQuerySchema,
  },
  {
    method: "get",
    path: "/admin/businesses",
    tag: "Admin",
    summary: "All businesses",
    access: "admin",
    query: adminBusinessesQuerySchema,
  },
  {
    method: "patch",
    path: "/admin/businesses/{id}",
    tag: "Admin",
    summary: "Suspend or reactivate a business",
    access: "admin",
    body: updateBusinessStatusSchema,
  },
];

/** Request shapes as clients send them (before Zod's transforms run). */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const result: Record<string, unknown> = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  });
  // OpenAPI 3.1 already says which JSON Schema version it uses.
  delete result.$schema;
  return result;
}

function queryParameters(schema: z.ZodObject) {
  const { properties = {}, required = [] } = jsonSchema(schema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: "query",
    required: required.includes(name),
    schema: propertySchema,
  }));
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

const errorResponse = {
  description: "Error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of operations) {
    const status = op.status ?? 200;
    paths[op.path] ??= {};
    paths[op.path]![op.method] = {
      tags: [op.tag],
      summary: op.summary,
      security: op.access === "public" ? [] : [{ cookieAuth: [] }],
      description: op.access === "admin" ? "Admins only." : undefined,
      parameters: [...pathParameters(op.path), ...(op.query ? queryParameters(op.query) : [])],
      requestBody: op.body
        ? { required: true, content: { "application/json": { schema: jsonSchema(op.body) } } }
        : undefined,
      responses: {
        [status]: { description: status === 204 ? "No content" : "Success" },
        default: errorResponse,
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Booking Platform API",
      version: "1.0.0",
      description:
        "Log in with POST /auth/login; the session lives in httpOnly cookies, so in this page " +
        "requests work once you're logged in on the same origin.",
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", examples: ["SLOT_TAKEN"] },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
      },
    },
    paths,
  };
}
