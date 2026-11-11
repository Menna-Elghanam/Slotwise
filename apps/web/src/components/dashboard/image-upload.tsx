"use client";

import type { BusinessImageKind } from "@booking/shared";
import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { ImageUpload as SignedUpload, OwnedBusiness } from "@/lib/types";
import { useRefreshWorkspace } from "@/lib/workspace";
import { useToast } from "../toast";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * 1. The API signs an upload into this business's folder.
 * 2. The browser sends the file straight to Cloudinary (it never passes through our API).
 * 3. The API saves the image URL, after checking it's this business's own upload.
 */
export function ImageUpload({
  business,
  kind,
}: {
  business: OwnedBusiness;
  kind: BusinessImageKind;
}) {
  const inputId = useId();
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();
  const field = kind === "logo" ? "logoUrl" : "coverUrl";
  const current = business[field];

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        throw new Error("Please choose a JPG, PNG or WebP image.");
      }
      if (file.size > MAX_BYTES) {
        throw new Error("Please choose an image under 5 MB.");
      }
      const signed = await api.post<SignedUpload>(`/businesses/${business.id}/image-uploads`, {
        kind,
      });
      const form = new FormData();
      for (const [key, value] of Object.entries(signed.fields)) {
        form.append(key, value);
      }
      form.append("file", file);
      const res = await fetch(signed.uploadUrl, { method: "POST", body: form });
      if (!res.ok) {
        throw new Error("The image service rejected the upload. Please try another image.");
      }
      const { secure_url: url } = (await res.json()) as { secure_url: string };
      await api.patch(`/businesses/${business.id}`, { [field]: url });
    },
    onSuccess: async () => {
      await refreshWorkspace();
      toast(kind === "logo" ? "Logo updated" : "Cover image updated");
    },
  });

  const remove = useMutation({
    mutationFn: () => api.patch(`/businesses/${business.id}`, { [field]: null }),
    onSuccess: async () => {
      await refreshWorkspace();
      toast("Image removed");
    },
  });

  const error = upload.error ?? remove.error;
  const uploadsOff = error instanceof ApiError && error.code === "UPLOADS_DISABLED";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{kind === "logo" ? "Logo" : "Cover image"}</p>
      {current ? (
        // Shown at its real proportions; Cloudinary serves it.
        <img
          src={current}
          alt={kind === "logo" ? "Current logo" : "Current cover image"}
          className={
            kind === "logo"
              ? "size-20 rounded-lg object-cover"
              : "h-32 w-full max-w-md rounded-lg object-cover"
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">No image yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
        >
          {upload.isPending ? "Uploading…" : current ? "Replace" : "Upload"}
        </label>
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              upload.mutate(file);
            }
            // Allow choosing the same file again after an error.
            e.target.value = "";
          }}
        />
        {current && (
          <Button
            size="sm"
            variant="ghost"
            pending={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove
          </Button>
        )}
      </div>
      {error && (
        <Alert tone="error">
          {uploadsOff
            ? "Image uploads aren't set up on this server yet (Cloudinary isn't configured)."
            : error instanceof Error && !(error instanceof ApiError)
              ? error.message
              : errorMessage(error)}
        </Alert>
      )}
    </div>
  );
}
