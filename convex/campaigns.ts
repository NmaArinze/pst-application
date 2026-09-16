/**
 * convex/campaigns.ts
 *
 * Internal Convex functions (query/mutation) for campaign lifecycle management — create, edit basic details, and enforce status transitions.
 * Participant assignment is deliberately NOT handled here 
 * (see Phase 7 / convex/campaignAssignments.ts) — campaign creation and participant assignment are separate operations per spec.
 *
 * WHY THIS EXISTS:
 * A Campaign is the primary container for a phishing-awareness exercise. Its lifecycle (DRAFT -> SCHEDULED/TESTING -> ACTIVE ->
 * COMPLETED/CANCELLED) must be enforced server-side, not just hidden in the UI, so a client can never force an illegal transition (e.g. re-activating a COMPLETED campaign).
 * No auth logic lives here — every caller is already verified by convex/http.ts's authedRoute() before these functions run.
 
 * FLOW: campaigns.js / campaign-detail.js -> api.js -> http.ts (session
 * validation) -> campaigns.ts (this file) -> database.
 *
 * CONNECTS TO:
 * - convex/schema.ts — the `campaigns` table (Phase 3).
 * - convex/templates.ts — a campaign references one template by ID.
 * - convex/http.ts — wraps each function in an authedRoute() route.
 * - src/js/campaigns.js, src/js/campaign-detail.js — the frontend pages.
 * - Phase 7 will add campaignAssignments referencing campaigns by ID.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

type CampaignStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

/**
 * Legal status transitions, enforced server-side. A transition not
 * listed here is rejected regardless of what the client requests.
 * Mirrors the spec's Campaign Status section exactly.
 */
const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["SCHEDULED", "ACTIVE", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED", "DRAFT"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: [], // terminal — no transitions allowed out of COMPLETED
  CANCELLED: [], // terminal — no transitions allowed out of CANCELLED
};

/** List campaigns, optionally filtered by status. Newest first. */
export const list = internalQuery({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const results =
      args.status !== undefined
        ? await ctx.db
            .query("campaigns")
            .withIndex("by_status", (q) => q.eq("status", args.status as CampaignStatus))
            .collect()
        : await ctx.db.query("campaigns").collect();

    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Fetch a single campaign by ID, including its template's name for display. */
export const get = internalQuery({
  args: { id: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.id);
    if (!campaign) return null;

    const template = await ctx.db.get(campaign.templateId);
    return { ...campaign, templateName: template?.name ?? "(template removed)" };
  },
});

/**
 * Create a new campaign in DRAFT status. Requires an active template.
 * If sendingMode is SCHEDULED, scheduledAt is required and must be in
 * the future.
 */
export const create = internalMutation({
  args: {
    name: v.string(),
    templateId: v.id("templates"),
    sendingMode: v.union(v.literal("MANUAL"), v.literal("SCHEDULED")),
    scheduledAt: v.optional(v.number()),
    createdByAdministratorId: v.id("administrators"),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError("Campaign name is required.");
    }

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError("Selected template not found.");
    }
    if (!template.active) {
      throw new ConvexError("Selected template is inactive. Choose an active template.");
    }

    if (args.sendingMode === "SCHEDULED") {
      if (!args.scheduledAt) {
        throw new ConvexError("A scheduled date/time is required for scheduled sending.");
      }
      if (args.scheduledAt <= Date.now()) {
        throw new ConvexError("Scheduled date/time must be in the future.");
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("campaigns", {
      name,
      templateId: args.templateId,
      status: "DRAFT",
      sendingMode: args.sendingMode,
      scheduledAt: args.sendingMode === "SCHEDULED" ? args.scheduledAt : undefined,
      createdBy: args.createdByAdministratorId,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

/**
 * Edit a campaign's name/template/sending mode/schedule. Only allowed
 * while the campaign is in DRAFT or SCHEDULED — once ACTIVE, the
 * configuration is locked (matches the spec: "Do not permanently lock
 * participant selection to campaign creation" refers to participants,
 * not core config, which should stop changing once sending begins).
 */
export const update = internalMutation({
  args: {
    id: v.id("campaigns"),
    name: v.string(),
    templateId: v.id("templates"),
    sendingMode: v.union(v.literal("MANUAL"), v.literal("SCHEDULED")),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.id);
    if (!campaign) {
      throw new ConvexError("Campaign not found.");
    }
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      throw new ConvexError(
        `Cannot edit a campaign that is ${campaign.status}. Only DRAFT or SCHEDULED campaigns can be edited.`
      );
    }

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError("Campaign name is required.");
    }

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError("Selected template not found.");
    }
    if (!template.active) {
      throw new ConvexError("Selected template is inactive. Choose an active template.");
    }

    if (args.sendingMode === "SCHEDULED") {
      if (!args.scheduledAt) {
        throw new ConvexError("A scheduled date/time is required for scheduled sending.");
      }
      if (args.scheduledAt <= Date.now()) {
        throw new ConvexError("Scheduled date/time must be in the future.");
      }
    }

    await ctx.db.patch(args.id, {
      name,
      templateId: args.templateId,
      sendingMode: args.sendingMode,
      scheduledAt: args.sendingMode === "SCHEDULED" ? args.scheduledAt : undefined,
      updatedAt: Date.now(),
    });

    return { status: "updated" };
  },
});

/**
 * Transition a campaign's status. This is the ONLY place a campaign's
 * status may change — every transition is checked against
 * ALLOWED_TRANSITIONS before being applied, so an illegal jump (e.g.
 * COMPLETED -> ACTIVE) is rejected regardless of what the client sends.
 */
export const transitionStatus = internalMutation({
  args: {
    id: v.id("campaigns"),
    toStatus: v.union(
      v.literal("DRAFT"),
      v.literal("SCHEDULED"),
      v.literal("ACTIVE"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED")
    ),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.id);
    if (!campaign) {
      throw new ConvexError("Campaign not found.");
    }

    const currentStatus = campaign.status as CampaignStatus;
    const allowed = ALLOWED_TRANSITIONS[currentStatus];

    if (!allowed.includes(args.toStatus)) {
      throw new ConvexError(
        `Cannot move a campaign from ${currentStatus} to ${args.toStatus}.`
      );
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { status: args.toStatus, updatedAt: now };

    if (args.toStatus === "ACTIVE") patch.launchedAt = now;
    if (args.toStatus === "COMPLETED") patch.completedAt = now;
    if (args.toStatus === "CANCELLED") patch.cancelledAt = now;

    await ctx.db.patch(args.id, patch);

    return { status: "transitioned", newStatus: args.toStatus };
  },
});