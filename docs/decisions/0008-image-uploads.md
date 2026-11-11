# 0008 — Image uploads: signed direct uploads to Cloudinary, no SDK

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Owners upload a logo and a cover image for their business page.

## Decision

1. The owner's browser calls `POST /businesses/:id/image-uploads` with `kind: logo|cover`.
2. The API returns Cloudinary's upload URL and **signed fields**: folder
   `businesses/<id>`, `public_id` = the kind, `allowed_formats=jpg,png,webp`, a timestamp,
   and the signature.
3. The browser uploads the file **directly to Cloudinary**. If it changes any signed
   field, Cloudinary rejects the upload.
4. The browser saves the returned URL with `PATCH /businesses/:id { logoUrl }`. The API
   accepts only URLs of this business's own upload slot in our Cloudinary account.

The signature is SHA-1 of the sorted parameters plus the API secret: a few lines with
`node:crypto`, checked in a test against the worked example in Cloudinary's docs.

## Alternatives considered

- **Uploading through our API (multer + the Cloudinary SDK):** image bytes would pass
  through our server, costing memory and bandwidth, plus two dependencies.
- **Unsigned upload presets:** anyone could upload anything to our account.

## Consequences

- A new logo overwrites the old file (same `public_id`), so storage doesn't fill up.
- Cloudinary is optional: without its three variables, the endpoint answers
  `503 UPLOADS_DISABLED` and everything else still works.
- File size isn't limited by the signature; set a limit in the Cloudinary upload settings.
