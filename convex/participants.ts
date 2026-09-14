/**
 * convex/participants.ts
 *
 * Internal Convex functions (query/mutation) for participant management.
 *
 * WHY THIS EXISTS:
 * Holds the actual database logic for Phase 4 — list, create, edit,
 * activate/deactivate participants. These are `internal*` functions,
 * meaning Convex blocks the browser from calling them directly over the
 * WebSocket client. The only way to reach them is through the
 * authenticated HTTP Action routes in convex/http.ts, which validate
 * the session first (see convex/lib/authHttp.ts).
 *
 * Business-rule errors (e.g. duplicate email) are thrown as
 * ConvexError, not plain Error — ConvexError sends a clean message to
 * the caller as intentional data; a plain Error gets wrapped by Convex
 * as "Uncaught Error: ..." with internal file/line info, which is
 * meant for server logs, not for display to an admin in the UI.
 *
 * CONNECTS TO:
 * - convex/schema.ts — the `participants` table defined in Phase 3.
 * - convex/http.ts — wraps each function below in a session-checked
 *   HTTP route (added in this same phase). authedRoute() in
 *   convex/lib/httpHelpers.ts reads ConvexError.data as the clean
 *   { error: "..." } response it sends to the frontend.
 * - src/js/participants.js — the frontend page that calls those routes.
 *
 * No participant data is ever hardcoded here — every value comes from
 * the HTTP request body, ultimately typed in by an administrator.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/**
 * Generates a short, human-readable, unique participant code
 * (e.g. "PST-4K9Q2A"). Retries on the rare collision.
 */
async function generateParticipantCode(ctx: { db: any }): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "PST-";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const existing = await ctx.db
      .query("participants")
      .withIndex("by_participantCode", (q: any) => q.eq("participantCode", code))
      .unique();
    if (!existing) return code;
  }
  throw new ConvexError("Could not generate a unique participant code — please retry.");
}

/** List participants, optionally filtered by department, active status, or a search term. */
export const list = internalQuery({
  args: {
    department: v.optional(v.string()),
    active: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let results = await ctx.db.query("participants").collect();

    if (args.department) {
      results = results.filter((p) => p.department === args.department);
    }
    if (args.active !== undefined) {
      results = results.filter((p) => p.active === args.active);
    }
    if (args.search) {
      const term = args.search.toLowerCase();
      results = results.filter(
        (p) =>
          p.fullName.toLowerCase().includes(term) ||
          p.email.toLowerCase().includes(term) ||
          p.department.toLowerCase().includes(term)
      );
    }

    return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
  },
});

/** Fetch a single participant by ID — used by the detail drawer. */
export const get = internalQuery({
  args: { id: v.id("participants") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Create a new participant. Rejects a duplicate email before inserting. */
export const create = internalMutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const fullName = args.fullName.trim();
    const department = args.department.trim();

    if (!fullName || !email || !department) {
      throw new ConvexError("Full name, email, and department are all required.");
    }

    const existing = await ctx.db
      .query("participants")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      throw new ConvexError("A participant with this email already exists.");
    }

    const participantCode = await generateParticipantCode(ctx);
    const now = Date.now();

    const id = await ctx.db.insert("participants", {
      participantCode,
      fullName,
      email,
      department,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    return { id, participantCode };
  },
});

/** Edit an existing participant's name/email/department. */
export const update = internalMutation({
  args: {
    id: v.id("participants"),
    fullName: v.string(),
    email: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const fullName = args.fullName.trim();
    const department = args.department.trim();

    if (!fullName || !email || !department) {
      throw new ConvexError("Full name, email, and department are all required.");
    }

    const existingWithEmail = await ctx.db
      .query("participants")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingWithEmail && existingWithEmail._id !== args.id) {
      throw new ConvexError("Another participant already uses this email.");
    }

    await ctx.db.patch(args.id, {
      fullName,
      email,
      department,
      updatedAt: Date.now(),
    });

    return { status: "updated" };
  },
});

/** Activate or deactivate a participant. Never deletes — preserves history. */
export const setActive = internalMutation({
  args: { id: v.id("participants"), active: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: args.active, updatedAt: Date.now() });
    return { status: "updated" };
  },
});