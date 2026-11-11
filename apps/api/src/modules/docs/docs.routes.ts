import { Router } from "express";
import { buildOpenApiDocument } from "./openapi.js";

export const docsRouter = Router();

// Built once: the document only changes when the code does.
const document = buildOpenApiDocument();

// Swagger UI from a CDN, pinned to an exact version, instead of another npm dependency.
const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0";

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Booking Platform API</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="docs"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: "/openapi.json", dom_id: "#docs", withCredentials: true });
    </script>
  </body>
</html>`;

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(document);
});

docsRouter.get("/docs", (_req, res) => {
  res.type("html").send(page);
});
