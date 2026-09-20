/**
 * convex/tracking.ts
 * Resolves a tracking token and records a LINK_CLICKED event. Public,
 * unauthenticated by design — participants never log in. No sensitive
 * data is ever read or written here; only the click itself.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Records a click for a given token. Returns whether the token was
 * valid, so the HTTP route (http.ts) can decide which landing page to
 * show — but never reveals *why* an invalid token failed.
 */
export const recordClick = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const assignment = await ctx.db
      .query("campaignAssignments")
      .withIndex("by_trackingToken", (q) => q.eq("trackingToken", args.token))
      .unique();

    if (!assignment) {
      return { valid: false };
    }

    await ctx.db.insert("events", {
      assignmentId: assignment._id,
      type: "LINK_CLICKED",
      occurredAt: Date.now(),
      // Minimal, non-sensitive technical metadata only — never
      // credentials or anything participant-identifying beyond what
      // the assignment link already is.
      metadata: {},
    });

    return { valid: true };
  },
});