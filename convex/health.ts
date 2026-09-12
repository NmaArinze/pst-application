import { query } from "./_generated/server";

/**
 * Infrastructure-only health check for Phase 1.
 * Not a business-data function — proves the frontend can reach the
 * Convex deployment before any real schema/functions exist (Phase 3+).
 */
export const ping = query({
  args: {},
  handler: async () => {
    return { status: "ok", time: Date.now() };
  },
});