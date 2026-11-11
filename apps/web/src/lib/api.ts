/**
 * The browser's API client. Requests go to /api/* on this app's own origin, which Next.js
 * forwards to the Express API, so the httpOnly auth cookies are sent automatically.
 */
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field errors from a 400 VALIDATION_ERROR, e.g. { email: ["Invalid email"] }. */
  get fieldErrors(): Record<string, string[]> {
    return this.code === "VALIDATION_ERROR" && typeof this.details === "object" && this.details
      ? (this.details as Record<string, string[]>)
      : {};
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Paths where a 401 means "wrong credentials or link", not "session expired".
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

/**
 * One refresh at a time. Without this, several requests failing together would each send
 * the same refresh token; the API rotates it on first use and would see the rest as theft.
 */
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  return fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, error.code, error.message, error.details);
  } catch {
    return new ApiError(res.status, "UNKNOWN", "Something went wrong. Please try again.");
  }
}

export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body);

  // The 15-minute access token expired: get a new one with the refresh token and retry once.
  if (res.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    const refreshed = await refreshSession();
    // Even if this tab's refresh lost a race with another tab, the browser may now hold
    // the other tab's fresh cookies, so retrying is still worth it.
    res = await send(method, path, body);
    if (!refreshed && res.status === 401) {
      throw await toApiError(res);
    }
  }

  if (!res.ok) {
    throw await toApiError(res);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>("GET", path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => apiRequest<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>("PATCH", path, body),
  delete: <T>(path: string) => apiRequest<T>("DELETE", path),
};

/** A message for the user from any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return "Something went wrong. Please check your connection and try again.";
}

/** Builds `?a=1&b=2`, leaving out empty values. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
