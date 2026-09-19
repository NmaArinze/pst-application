/**
 * convex/campaignAssignments.ts
 * Links participants to a campaign, generating a unique tracking token
 * per assignment. Supports incremental assignment, blocks duplicates
 * and assignment to COMPLETED/CANCELLED campaigns.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";

function generateTrackingToken(): string {
  // Same Web Crypto API already proven in auth.ts's session tokens.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** List all assignments for a campaign, joined with participant info for display. */
export const listForCampaign = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("campaignAssignments")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    const withParticipants = await Promise.all(
      assignments.map(async (a) => {
        const participant = await ctx.db.get(a.participantId);
        return {
          ...a,
          participantName: participant ? `${participant.firstName} ${participant.surname}` : "(removed)",
          participantEmail: participant?.email ?? "",
          participantDepartment: participant?.department ?? "",
        };
      })
    );

    return withParticipants.sort((a, b) => a.participantName.localeCompare(b.participantName));
  },
});

/**
 * Active participants not yet assigned to this campaign — powers the
 * "add participants" picker. Returns only the fields the picker needs,
 * not full participant records.
 */
export const listUnassignedActiveParticipants = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const [allActive, existingAssignments] = await Promise.all([
      ctx.db
        .query("participants")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect(),
      ctx.db
        .query("campaignAssignments")
        .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId))
        .collect(),
    ]);

    const assignedIds = new Set(existingAssignments.map((a) => a.participantId));
    return allActive
      .filter((p) => !assignedIds.has(p._id))
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
      .map((p) => ({
        _id: p._id,
        firstName: p.firstName,
        surname: p.surname,
        email: p.email,
        department: p.department,
      }));
  },
});

/**
 * Assign participants to a campaign. Skips already-assigned or
 * inactive/nonexistent participants rather than failing the whole
 * batch; returns counts so the caller can report exactly what happened.
 */
export const assignParticipants = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    participantIds: v.array(v.id("participants")),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      throw new ConvexError("Campaign not found.");
    }
    if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
      throw new ConvexError(
        `Cannot assign participants to a ${campaign.status.toLowerCase()} campaign.`
      );
    }
    if (args.participantIds.length === 0) {
      throw new ConvexError("Select at least one participant.");
    }

    let assigned = 0;
    let skipped = 0;
    let invalid = 0;

    for (const participantId of args.participantIds) {
      const participant = await ctx.db.get(participantId);
      if (!participant || !participant.active) {
        invalid++;
        continue;
      }

      const existing = await ctx.db
        .query("campaignAssignments")
        .withIndex("by_campaignId_participantId", (q) =>
          q.eq("campaignId", args.campaignId).eq("participantId", participantId)
        )
        .unique();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("campaignAssignments", {
        campaignId: args.campaignId,
        participantId,
        templateId: campaign.templateId,
        trackingToken: generateTrackingToken(),
        emailStatus: "NOT_SENT",
        createdAt: Date.now(),
      });
      assigned++;
    }

    return { assigned, skipped, invalid };
  },
});