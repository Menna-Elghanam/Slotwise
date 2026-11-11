import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../test/helpers.js";
import { operations } from "./openapi.js";

/** Counts `someRouter.get(` style registrations in the route files. */
function countRegisteredRoutes(): number {
  const modulesDir = join(import.meta.dirname, "..");
  let count = 0;
  for (const moduleName of readdirSync(modulesDir)) {
    for (const file of readdirSync(join(modulesDir, moduleName))) {
      if (file.endsWith(".routes.ts")) {
        const source = readFileSync(join(modulesDir, moduleName, file), "utf8");
        count += source.match(/Router\.(get|post|put|patch|delete)\(/g)?.length ?? 0;
      }
    }
  }
  // The docs routes themselves aren't part of the documented API.
  return count - 2;
}

describe("API docs", () => {
  it("document as many routes as are registered", () => {
    expect(operations).toHaveLength(countRegisteredRoutes());
  });

  it("only document routes that exist", async () => {
    for (const op of operations) {
      const path = op.path.replace(/\{\w+\}/g, "00000000-0000-4000-8000-000000000000");
      const res = await request(app)[op.method](path);
      // Any answer but the catch-all "no such route" means the route exists.
      expect(res.body, `${op.method.toUpperCase()} ${op.path}`).not.toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    }
  });

  it("serve the OpenAPI document and the docs page", async () => {
    const json = await request(app).get("/openapi.json");
    const page = await request(app).get("/docs");

    expect(json.body).toMatchObject({ openapi: "3.1.0", paths: { "/bookings": {} } });
    expect(page.text).toContain("SwaggerUIBundle");
  });
});
