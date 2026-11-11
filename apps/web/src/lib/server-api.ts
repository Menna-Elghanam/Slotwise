/**
 * Fetching public data in server components: straight from the API over the server's
 * network, no cookies involved. Only for data anyone may see.
 */
import { connection } from "next/server";
import { ApiError } from "./api";
import type { ApiErrorBody } from "./types";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

export async function serverGet<T>(path: string): Promise<T> {
  // Render at request time. Otherwise `next build` would prerender these pages and call
  // the API while building, freezing whatever data existed then.
  await connection();

  const res = await fetch(`${apiUrl}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? "UNKNOWN",
      body?.error.message ?? `API request failed with ${res.status}`,
    );
  }
  return (await res.json()) as T;
}
