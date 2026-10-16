// Signed uploads (docs/prd/02-integration.md, "Uploads"): files from Claude
// never travel as tool arguments; core_create_upload issues a one-time URL.
import { z } from "zod";

export const UPLOAD_KINDS = ["resume", "cover_letter"] as const;

/** PDF and Word (.docx). */
export const UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** Per file. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** How long an upload URL works after it's issued. */
export const UPLOAD_TTL_SECONDS = 10 * 60;

export const UPLOAD_FILENAME_MAX_LENGTH = 200;

/** core_create_upload's input: what the file will be, never the file. */
export const createUploadInputSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  filename: z.string().trim().min(1).max(UPLOAD_FILENAME_MAX_LENGTH),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
  bytes: z.number().int().min(1).max(UPLOAD_MAX_BYTES),
});
export type CreateUploadInput = z.infer<typeof createUploadInputSchema>;

export interface CreatedUpload {
  uploadId: string;
  /** PUT the file here, with the declared Content-Type and size. */
  uploadUrl: string;
  expiresAt: string;
}

export const uploadErrorCodes = [
  "upload_invalid",
  "upload_expired",
  "upload_used",
  "upload_too_large",
  "upload_wrong_type",
] as const;
export type UploadErrorCode = (typeof uploadErrorCodes)[number];
