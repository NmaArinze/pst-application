/**
 * convex/templates.ts
 *
 * Internal Convex functions (query/mutation) for Template management.
 * No authentication logic lives here — every caller is already
 * verified by convex/http.ts's authedRoute()/requireAdmin() before
 * these functions run. This file only knows about templates data.
 *
 * WHY THIS EXISTS:
 * Templates are reusable simulated-phishing email definitions. PST
 * stores name/description/emailSubject/senderName/resendTemplateId —
 * per spec Section 6, subject and sender are PST-owned metadata passed
 * to Resend at send time (Phase 9); the visual design itself lives in
 * Resend Templates, referenced only by resendTemplateId.
 *
 * FLOW: templates.js -> api.js -> http.ts (session validation) ->
 * templates.ts (this file) -> database. Never called directly from the
 * browser over the WebSocket client.
 *
 * CONNECTS TO:
 * - convex/schema.ts — the `templates` table (Phase 3).
 * - convex/http.ts — wraps each function in an authedRoute() route.
 * - src/js/templates.js — the frontend page.
 * - Phase 9 (Resend Integration) will read resendTemplateId from here.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/** List templates, optionally filtered by active status. Uses the by_active index directly rather than filtering in JS when the filter is given. */
export const list = internalQuery({
  args: { active: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const results =
      args.active !== undefined
        ? await ctx.db
            .query("templates")
            .withIndex("by_active", (q) => q.eq("active", args.active!))
            .collect()
        : await ctx.db.query("templates").collect();

    return results.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Fetch a single template by ID — used by the detail drawer. */
export const get = internalQuery({
  args: { id: v.id("templates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Create a new template. Rejects a duplicate Resend Template ID before inserting. */
export const create = internalMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    emailSubject: v.string(),
    senderName: v.string(),
    resendTemplateId: v.string(),
    createdByAdministratorId: v.id("administrators"),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const emailSubject = args.emailSubject.trim();
    const senderName = args.senderName.trim();
    const resendTemplateId = args.resendTemplateId.trim();

    if (!name || !emailSubject || !senderName || !resendTemplateId) {
      throw new ConvexError(
        "Name, email subject, sender name, and Resend Template ID are all required."
      );
    }

    const existing = await ctx.db
      .query("templates")
      .withIndex("by_resendTemplateId", (q) => q.eq("resendTemplateId", resendTemplateId))
      .unique();
    if (existing) {
      throw new ConvexError("A template with this Resend Template ID already exists.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("templates", {
      name,
      description: args.description?.trim() || undefined,
      emailSubject,
      senderName,
      resendTemplateId,
      active: true,
      createdBy: args.createdByAdministratorId,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

/** Edit an existing template's details. Errors clearly if the template doesn't exist. */
export const update = internalMutation({
  args: {
    id: v.id("templates"),
    name: v.string(),
    description: v.optional(v.string()),
    emailSubject: v.string(),
    senderName: v.string(),
    resendTemplateId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTemplate = await ctx.db.get(args.id);
    if (!existingTemplate) {
      throw new ConvexError("Template not found.");
    }

    const name = args.name.trim();
    const emailSubject = args.emailSubject.trim();
    const senderName = args.senderName.trim();
    const resendTemplateId = args.resendTemplateId.trim();

    if (!name || !emailSubject || !senderName || !resendTemplateId) {
      throw new ConvexError(
        "Name, email subject, sender name, and Resend Template ID are all required."
      );
    }

    const existingWithId = await ctx.db
      .query("templates")
      .withIndex("by_resendTemplateId", (q) => q.eq("resendTemplateId", resendTemplateId))
      .unique();
    if (existingWithId && existingWithId._id !== args.id) {
      throw new ConvexError("Another template already uses this Resend Template ID.");
    }

    await ctx.db.patch(args.id, {
      name,
      description: args.description?.trim() || undefined,
      emailSubject,
      senderName,
      resendTemplateId,
      updatedAt: Date.now(),
    });

    return { status: "updated" };
  },
});

/**
 * Activate or deactivate a template. Never deletes — a deactivated
 * template must not affect campaigns that already reference it (spec
 * Section 6). Errors clearly if the template doesn't exist.
 */
export const setActive = internalMutation({
  args: { id: v.id("templates"), active: v.boolean() },
  handler: async (ctx, args) => {
    const existingTemplate = await ctx.db.get(args.id);
    if (!existingTemplate) {
      throw new ConvexError("Template not found.");
    }

    await ctx.db.patch(args.id, { active: args.active, updatedAt: Date.now() });
    return { status: "updated" };
  },
});