// Paged lists (02-integration): a list that can grow without bound takes
// `limit` and `cursor` and returns `nextCursor` while there is more. A list
// bounded by one owner's records returns whole.
import { z } from "zod";

export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;
/** Opaque to callers: passed back as given. */
export const CURSOR_MAX_LENGTH = 200;

export const listLimitSchema = z.number().int().min(1).max(LIST_LIMIT_MAX);
export const cursorSchema = z.string().min(1).max(CURSOR_MAX_LENGTH);
