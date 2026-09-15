/**
 * convex/participants.ts
 *
 * Internal Convex functions (query/mutation) for participant management.
 *
 * WHY THIS EXISTS:
 * Holds the actual database logic for Phase 4 — list, create, edit,
 * activate/deactivate participants. Stored as separate firstName/surname
 * (not a single fullName) per spec Section 5 — Resend's email personalization
 * (Phase 9) needs firstName in isolation to address participants correctly
 * ("Hi {FIRST_NAME}"), which a combined string can't reliably provide.
 * Reached only through session-checked HTTP Actions in http.ts.
 *
 * CONNECTS TO:
 * - convex/schema.ts — the `participants` table (Phase 3/updated Phase 5).
 * - convex/http.ts — wraps each function in an authedRoute() route.
 * - src/js/participants.js — the frontend page.
 * - Phase 9 (Resend Integration) will read firstName as FIRST_NAME.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

async function generateParticipantCode(ctx: { db: any }): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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
    let results =
      args.active !== undefined
        ? await ctx.db
            .query("participants")
            .withIndex("by_active", (q) => q.eq("active", args.active!))
            .collect()
        : await ctx.db.query("participants").collect();

    if (args.department) {
      results = results.filter((p) => p.department === args.department);
    }
    if (args.search) {
      const term = args.search.toLowerCase();
      results = results.filter(
        (p) =>
          p.firstName.toLowerCase().includes(term) ||
          p.surname.toLowerCase().includes(term) ||
          p.email.toLowerCase().includes(term) ||
          p.department.toLowerCase().includes(term)
      );
    }

    return results.sort((a, b) =>
      `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`)
    );
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
    firstName: v.string(),
    surname: v.string(),
    email: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const firstName = args.firstName.trim();
    const surname = args.surname.trim();
    const department = args.department.trim();

    if (!firstName || !surname || !email || !department) {
      throw new ConvexError("First name, surname, email, and department are all required.");
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
      firstName,
      surname,
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
    firstName: v.string(),
    surname: v.string(),
    email: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    const existingParticipant = await ctx.db.get(args.id);
    if (!existingParticipant) {
      throw new ConvexError("Participant not found.");
    }

    const email = args.email.trim().toLowerCase();
    const firstName = args.firstName.trim();
    const surname = args.surname.trim();
    const department = args.department.trim();

    if (!firstName || !surname || !email || !department) {
      throw new ConvexError("First name, surname, email, and department are all required.");
    }

    const existingWithEmail = await ctx.db
      .query("participants")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingWithEmail && existingWithEmail._id !== args.id) {
      throw new ConvexError("Another participant already uses this email.");
    }

    await ctx.db.patch(args.id, {
      firstName,
      surname,
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
    const existingParticipant = await ctx.db.get(args.id);
    if (!existingParticipant) {
      throw new ConvexError("Participant not found.");
    }

    await ctx.db.patch(args.id, { active: args.active, updatedAt: Date.now() });
    return { status: "updated" };
  },
});