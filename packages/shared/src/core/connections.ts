// GET /api/connections: Claude clients holding a grant (docs/prd/01, the
// Connections screen). DELETE /api/connections/:id revokes one.
import { z } from "zod";

export const connectionSchema = z.object({
  /** The grant's id; DELETE /api/connections/:id revokes it. */
  id: z.string(),
  clientName: z.string(),
  /** A metadata-document client's domain, else where its tokens go. */
  origin: z.string(),
  grantedAt: z.string(),
  /** The client's last MCP write (only writes are audited), or null. */
  lastUsedAt: z.string().nullable(),
});
export type Connection = z.infer<typeof connectionSchema>;

export const connectionsResponseSchema = z.object({
  connections: z.array(connectionSchema),
});
