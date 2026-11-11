import type {
  BusinessImageKind,
  CreateBusinessInput,
  ListBusinessesQuery,
  UpdateBusinessInput,
} from "@booking/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import { cloudinaryConfig, signCloudinaryParams } from "../../lib/cloudinary.js";
import { db, isUniqueViolation } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";

// What anyone may see about a business (no owner id, no internal status).
const publicBusinessSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  address: true,
  timezone: true,
  logoUrl: true,
  coverUrl: true,
  minNoticeMinutes: true,
  maxDaysAhead: true,
  cancelCutoffHours: true,
} as const;

/** "Café Zürich!" → "cafe-zurich" */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip accents: NFKD split "é" into "e" + a combining mark
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "business";
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  const existing = await db.business.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((b) => b.slug));

  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/** Loads a business and checks that `userId` owns it. */
export async function assertOwner(businessId: string, userId: string) {
  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new AppError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  if (business.ownerId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Only the owner can do this");
  }
  return business;
}

export async function createBusiness(ownerId: string, input: CreateBusinessInput) {
  const slug = await generateUniqueSlug(input.name);

  try {
    return await db.business.create({ data: { ...input, ownerId, slug } });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }
    // Two unique columns can clash: ownerId (one business per owner) or slug.
    const alreadyOwnsOne = (await db.business.count({ where: { ownerId } })) > 0;
    if (alreadyOwnsOne) {
      throw new AppError(409, "BUSINESS_EXISTS", "You already own a business");
    }
    // Rare: someone took the same slug between our check and the insert.
    throw new AppError(409, "SLUG_TAKEN", "That name was just taken, please try again");
  }
}

export async function updateBusiness(
  businessId: string,
  userId: string,
  input: UpdateBusinessInput,
) {
  await assertOwner(businessId, userId);
  if (input.logoUrl) {
    assertOwnImageUrl(businessId, "logo", input.logoUrl);
  }
  if (input.coverUrl) {
    assertOwnImageUrl(businessId, "cover", input.coverUrl);
  }
  // The slug is deliberately not regenerated, so existing links keep working after a rename.
  return db.business.update({ where: { id: businessId }, data: input });
}

const IMAGE_FORMATS = ["jpg", "png", "webp"];

const uploadsDisabled = () =>
  new AppError(503, "UPLOADS_DISABLED", "Image uploads are not configured");

/**
 * Signs a direct browser-to-Cloudinary upload. The image never passes through our API, and
 * the signature pins where it lands (`businesses/<id>/logo`) and which formats are allowed.
 */
export async function createImageUpload(
  businessId: string,
  userId: string,
  kind: BusinessImageKind,
) {
  await assertOwner(businessId, userId);
  const cloudinary = cloudinaryConfig();
  if (!cloudinary) {
    throw uploadsDisabled();
  }

  const params = {
    allowed_formats: IMAGE_FORMATS.join(","),
    folder: `businesses/${businessId}`,
    // Same name every time: a new logo replaces the old file instead of piling up.
    public_id: kind,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
    fields: {
      ...params,
      api_key: cloudinary.apiKey,
      signature: signCloudinaryParams(params, cloudinary.apiSecret),
    },
  };
}

/** Only images uploaded for this business, so nobody can point their logo at any URL. */
function assertOwnImageUrl(businessId: string, kind: BusinessImageKind, url: string): void {
  const cloudinary = cloudinaryConfig();
  if (!cloudinary) {
    throw uploadsDisabled();
  }
  // String.raw keeps the backslashes, so `\.` means a literal dot and not "any character".
  const expected = new RegExp(
    String.raw`^https://res\.cloudinary\.com/${cloudinary.cloudName}/image/upload/(v\d+/)?` +
      String.raw`businesses/${businessId}/${kind}\.(${IMAGE_FORMATS.join("|")})$`,
  );
  if (!expected.test(url)) {
    throw new AppError(400, "INVALID_IMAGE_URL", "Use the URL returned by the image upload");
  }
}

export async function listBusinesses(query: ListBusinessesQuery) {
  const where: Prisma.BusinessWhereInput = {
    status: "ACTIVE",
    category: query.category,
    name: query.search ? { contains: query.search, mode: "insensitive" } : undefined,
    // Only list businesses a customer can actually book: an active service performed by an
    // active staff member who has working hours. Half-set-up businesses stay reachable by link.
    services: {
      some: {
        isActive: true,
        staff: { some: { staff: { isActive: true, workingHours: { some: {} } } } },
      },
    },
  };

  const [items, total] = await db.$transaction([
    db.business.findMany({
      where,
      select: publicBusinessSelect,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.business.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getBusinessBySlug(slug: string) {
  // Suspended businesses are hidden from the public.
  const business = await db.business.findFirst({
    where: { slug, status: "ACTIVE" },
    select: publicBusinessSelect,
  });
  if (!business) {
    throw new AppError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  return business;
}
