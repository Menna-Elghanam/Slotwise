import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api";

/**
 * Shows the API's field errors (400 VALIDATION_ERROR) on the matching inputs. Returns true
 * if it did, so the caller only shows a general message for other errors.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (!(err instanceof ApiError)) {
    return false;
  }
  const entries = Object.entries(err.fieldErrors);
  for (const [field, messages] of entries) {
    setError(field as Path<T>, { message: messages[0] ?? "Invalid value" });
  }
  return entries.length > 0;
}
