import type { NextConfig } from "next";

// Where the Express API runs. Rewrites are resolved at build time, so set this before
// `next build` in production (e.g. the API's internal Railway/Render URL).
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The browser only ever talks to this app; /api/* is forwarded to the API. That keeps
  // the auth cookies first-party (SameSite=Lax) and removes the need for CORS (ADR 0009).
  rewrites: () => Promise.resolve([{ source: "/api/:path*", destination: `${apiUrl}/:path*` }]),
  headers: () =>
    Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]),
};

export default nextConfig;
