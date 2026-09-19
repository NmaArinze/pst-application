/**
 * convex/emailQueue.ts
 * Operational visibility into campaign emails, plus sending.
 * Database state changes (mutations) are separate from the actual
 * Resend call (action) — NOT_SENT -> QUEUED happens first as an
 * idempotency lock, then the external call, then SENT or FAILED.
 */

import { internalMutation, internalQuery, internalAction, ActionCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sendViaResend } from "./lib/resend";

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
          lastError: a.lastError,
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

/** Everything the send action needs, gathered in one query. */
export const getSendDetails = internalQuery({
  args: { assignmentId: v.id("campaignAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;

    const [participant, campaign, template] = await Promise.all([
      ctx.db.get(assignment.participantId),
      ctx.db.get(assignment.campaignId),
      ctx.db.get(assignment.templateId),
    ]);

    return { assignment, participant, campaign, template };
  },
});

/** NOT_SENT -> QUEUED. The idempotency lock: only succeeds once per assignment. */
export const markQueued = internalMutation({
  args: { assignmentId: v.id("campaignAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new ConvexError("Assignment not found.");
    if (assignment.emailStatus !== "NOT_SENT") {
      throw new ConvexError(`Cannot send — this email is already ${assignment.emailStatus}.`);
    }
    await ctx.db.patch(args.assignmentId, { emailStatus: "QUEUED" });
  },
});

/** QUEUED -> SENT, after Resend accepts the email. Logs EMAIL_SENT event. */
export const markSent = internalMutation({
  args: { assignmentId: v.id("campaignAssignments") },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.assignmentId, { emailStatus: "SENT", sentAt: now, lastError: undefined });
    await ctx.db.insert("events", {
      assignmentId: args.assignmentId,
      type: "EMAIL_SENT",
      occurredAt: now,
    });
  },
});

/** QUEUED -> FAILED, with the error captured for troubleshooting. */
export const markFailed = internalMutation({
  args: { assignmentId: v.id("campaignAssignments"), errorMessage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.assignmentId, { emailStatus: "FAILED", lastError: args.errorMessage });
  },
});

/**
 * Sends one assignment's email: lock (QUEUED), call Resend, then SENT or
 * FAILED. This is the single place the actual send happens — sendOne
 * and sendPendingForCampaign both call this.
 */
async function sendAssignment(ctx: ActionCtx, assignmentId: Id<"campaignAssignments">) {
  const details = await ctx.runQuery(internal.emailQueue.getSendDetails, { assignmentId });
  if (!details || !details.assignment) throw new ConvexError("Assignment not found.");

  const { assignment, participant, campaign, template } = details;

  if (!campaign) throw new ConvexError("Campaign not found.");
  if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") {
    throw new ConvexError(`Cannot send — campaign is ${campaign.status}, must be ACTIVE or SCHEDULED.`);
  }
  if (!participant) throw new ConvexError("Participant not found.");
  if (!template) throw new ConvexError("Template not found.");

  // Idempotency lock — throws if this assignment isn't NOT_SENT, which
  // also prevents two concurrent calls from both proceeding to send.
  await ctx.runMutation(internal.emailQueue.markQueued, { assignmentId });

  try {
    await sendViaResend({
      to: participant.email,
      firstName: participant.firstName,
      trackingToken: assignment.trackingToken,
      resendTemplateId: template.resendTemplateId,
      senderName: template.senderName,
    });
    await ctx.runMutation(internal.emailQueue.markSent, { assignmentId });
  } catch (err: any) {
    const errorMessage = err?.message || "Unknown error sending email.";
    await ctx.runMutation(internal.emailQueue.markFailed, { assignmentId, errorMessage });
    throw new ConvexError(errorMessage);
  }
}

/** Send a single assignment's email. Actions can call fetch(); mutations cannot. */
export const sendOne = internalAction({
  args: { assignmentId: v.id("campaignAssignments") },
  handler: async (ctx, args) => {
    await sendAssignment(ctx, args.assignmentId);
    return { status: "sent" };
  },
});

/** Send all NOT_SENT assignments for a campaign, sequentially so one failure doesn't block the rest. */
export const sendPendingForCampaign = internalAction({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const pending: any[] = await ctx.runQuery(internal.emailQueue.list, {
      campaignId: args.campaignId,
      emailStatus: "NOT_SENT",
    });

    let sent = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        await sendAssignment(ctx, row._id);
        sent++;
      } catch {
        failed++;
      }
    }

    return { sent, failed, totalPending: pending.length };
  },
});