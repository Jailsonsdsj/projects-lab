// Left from F-18's signed uploads, retired by F-23 (R3-1: Claude's documents
// go straight to the owner; the app stores none). Only the `upload` table's
// CHECKs (C-10 to C-12) still read these; TD-01 drops the table and this file.

export const UPLOAD_KINDS = ["resume", "cover_letter"] as const;

/** PDF and Word (.docx). */
export const UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** Per file. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
