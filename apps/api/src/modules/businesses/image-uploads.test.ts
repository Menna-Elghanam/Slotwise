import { beforeEach, describe, expect, it } from "vitest";
import { signCloudinaryParams } from "../../lib/cloudinary.js";
import { resetDb } from "../../test/db.js";
import { createBusiness, loggedInAgent } from "../../test/helpers.js";

beforeEach(async () => {
  await resetDb();
});

describe("signCloudinaryParams", () => {
  it("matches the worked example in Cloudinary's documentation", () => {
    const signature = signCloudinaryParams(
      {
        timestamp: "1315060510",
        public_id: "sample_image",
        eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
      },
      "abcd",
    );

    expect(signature).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
});

describe("POST /businesses/:id/image-uploads", () => {
  it("gives the owner signed fields for a direct upload into the business's folder", async () => {
    const { agent, business } = await createBusiness("owner@example.com");

    const res = await agent.post(`/businesses/${business.id}/image-uploads`).send({ kind: "logo" });

    expect(res.status).toBe(200);
    const { fields } = res.body as {
      fields: Record<
        "allowed_formats" | "folder" | "public_id" | "timestamp" | "api_key" | "signature",
        string
      >;
    };
    expect(res.body).toMatchObject({
      uploadUrl: "https://api.cloudinary.com/v1_1/demo-cloud/image/upload",
    });
    expect(fields).toMatchObject({
      folder: `businesses/${business.id}`,
      public_id: "logo",
      allowed_formats: "jpg,png,webp",
      api_key: "123456789012345",
    });
    // Everything the browser sends except api_key and the signature itself is signed.
    const signed = {
      allowed_formats: fields.allowed_formats,
      folder: fields.folder,
      public_id: fields.public_id,
      timestamp: fields.timestamp,
    };
    expect(fields.signature).toBe(signCloudinaryParams(signed, "test-cloudinary-secret"));
  });

  it("forbids anyone but the owner", async () => {
    const { business } = await createBusiness("owner@example.com");
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger
      .post(`/businesses/${business.id}/image-uploads`)
      .send({ kind: "logo" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /businesses/:id with an image", () => {
  it("accepts the URL of an image uploaded for this business", async () => {
    const { agent, business } = await createBusiness("owner@example.com");
    const logoUrl = `https://res.cloudinary.com/demo-cloud/image/upload/v1731000000/businesses/${business.id}/logo.png`;

    const res = await agent.patch(`/businesses/${business.id}`).send({ logoUrl });
    const removed = await agent.patch(`/businesses/${business.id}`).send({ logoUrl: null });

    expect(res.body).toMatchObject({ business: { logoUrl } });
    expect(removed.body).toMatchObject({ business: { logoUrl: null } });
  });

  it.each([
    ["another site", "https://evil.example.com/logo.png"],
    [
      "another business",
      "https://res.cloudinary.com/demo-cloud/image/upload/businesses/other/logo.png",
    ],
    [
      "the wrong slot",
      "https://res.cloudinary.com/demo-cloud/image/upload/businesses/ID/cover.png",
    ],
    [
      "a look-alike host",
      "https://resXcloudinaryXcom/demo-cloud/image/upload/businesses/ID/logo.png",
    ],
  ])("rejects an image from %s", async (_label, url) => {
    const { agent, business } = await createBusiness("owner@example.com");

    const res = await agent
      .patch(`/businesses/${business.id}`)
      .send({ logoUrl: url.replace("ID", business.id) });

    expect(res.status).toBe(400);
  });
});
