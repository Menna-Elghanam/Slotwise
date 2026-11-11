import { createHash } from "node:crypto";
import { config } from "./config.js";

/**
 * Cloudinary's upload signature: the parameters sorted by name, joined as `a=1&b=2`, with
 * the API secret appended, then SHA-1. The browser sends the same parameters with the file;
 * Cloudinary rejects the upload if anything was changed.
 */
export function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(payload + apiSecret)
    .digest("hex");
}

export function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = config;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return null;
  }
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
  };
}
