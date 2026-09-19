/**
 * convex/emailQueue.ts
 * Operational visibility into campaign emails, plus send-triggering
 * (Phase 8 stub — flips status and logs an EMAIL_SENT event; real
 * Resend delivery is wired in Phase 9 without changing this shape).
 * Enforces idempotency: only a NOT_SENT assignment can be sent.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/** List queue rows, optionally filtered by campaign and/or email status. */
export const list = internalQuery({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    emailStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignments = args.campaignId
      ? await ctx.db
          .query("campaignAssignments")
          .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId!))
          .collect()
      : await ctx.db.query("campaignAssignments").collect();

    const filtered = args.emailStatus
      ? assignments.filter((a) => a.emailStatus === args.emailStatus)
      : assignments;

    const rows = await Promise.all(
      filtered.map(async (a) => {
        const [participant, campaign, template] = await Promise.all([
          ctx.db.get(a.participantId),
          ctx.db.get(a.campaignId),
          ctx.db.get(a.templateId),
        ]);
        return {
          _id: a._id,
          campaignId: a.campaignId,
          campaignName: campaign?.name ?? "(removed)",
          campaignScheduledAt: campaign?.scheduledAt,
          participantName: participant ? `${participant.firstName} ${participant.surname}` : "(removed)",
          participantEmail: participant?.email ?? "",
          templateName: template?.name ?? "(removed)",
          emailStatus: a.emailStatus,
          sentAt: a.sentAt,
        };
      })
    );

    return rows.sort((a, b) => a.campaignName.localeCompare(b.campaignName));
  },
});

/** Summary counts for one campaign — used by the campaign detail page's queue summary. */
export const summaryForCampaign = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("campaignAssignments")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    const counts = { NOT_SENT: 0, QUEUED: 0, SENT: 0, DELIVERED: 0, BOUNCED: 0, FAILED: 0 };
    for (const a of assignments) {
      counts[a.emailStatus as keyof typeof counts]++;
    }
    return { total: assignments.length, counts };
  },
});

/**
 * Send a single assignment's email. Stubbed for Phase 8 — flips status
 * to SENT and logs an EMAIL_SENT event; Phase 9 replaces the internals
 * with a real Resend call without changing this function's shape or
 * the idempotency guard below.
 */
export const sendOne = internalMutation({
  args: { assignmentId: v.id("campaignAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new ConvexError("Assignment not found.");
    }
    if (assignment.emailStatus !== "NOT_SENT") {
      throw new ConvexError(`Cannot send — this email is already ${assignment.emailStatus}.`);
    }

    const campaign = await ctx.db.get(assignment.campaignId);
    if (!campaign) {
      throw new ConvexError("Campaign not found.");
    }
    if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") {
      throw new ConvexError(
        `Cannot send — campaign is ${campaign.status}, must be ACTIVE or SCHEDULED.`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.assignmentId, { emailStatus: "SENT", sentAt: now });
    await ctx.db.insert("events", {
      assignmentId: args.assignmentId,
      type: "EMAIL_SENT",
      occurredAt: now,
    });

    return { status: "sent" };
  },
});

/**
 * Send all NOT_SENT assignments for a campaign. Processes sequentially
 * so one failure doesn't block the rest; returns counts.
 */
export const sendPendingForCampaign = internalMutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      throw new ConvexError("Campaign not found.");
    }
    if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") {
      throw new ConvexError(
        `Cannot send — campaign is ${campaign.status}, must be ACTIVE or SCHEDULED.`
      );
    }

    const pending = await ctx.db
      .query("campaignAssignments")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .filter((q) => q.eq(q.field("emailStatus"), "NOT_SENT"))
      .collect();

    let sent = 0;
    let failed = 0;

    for (const assignment of pending) {
      try {
        const now = Date.now();
        await ctx.db.patch(assignment._id, { emailStatus: "SENT", sentAt: now });
        await ctx.db.insert("events", {
          assignmentId: assignment._id,
          type: "EMAIL_SENT",
          occurredAt: now,
        });
        sent++;
      } catch {
        await ctx.db.patch(assignment._id, { emailStatus: "FAILED" });
        failed++;
      }
    }

    return { sent, failed, totalPending: pending.length };
  },
});