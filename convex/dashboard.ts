/**
 * convex/dashboard.ts
 * Aggregated Overview metrics: 5 summary counts + recent activity feed.
 * Read-only, computed from existing tables — no new state.
 */

import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const summary = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [participants, campaigns, assignments] = await Promise.all([
      ctx.db.query("participants").collect(),
      ctx.db.query("campaigns").collect(),
      ctx.db.query("campaignAssignments").collect(),
    ]);

    const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
    const emailsSent = assignments.filter(
      (a) => a.emailStatus === "SENT" || a.emailStatus === "DELIVERED"
    ).length;
    const emailsPending = assignments.filter((a) => a.emailStatus === "NOT_SENT").length;

    const clickEvents = await ctx.db
      .query("events")
      .withIndex("by_type", (q) => q.eq("type", "LINK_CLICKED"))
      .collect();
    const uniqueClickers = new Set(clickEvents.map((e) => e.assignmentId)).size;
    const clickRate = emailsSent > 0 ? Math.round((uniqueClickers / emailsSent) * 100) : 0;

    return {
      totalParticipants: participants.length,
      activeCampaigns,
      emailsSent,
      emailsPending,
      linkClicks: uniqueClickers,
      clickRate,
    };
  },
});

/**
 * Recent activity feed. Unfiltered: last 10 events. Filtered by
 * campaign and/or event type: last 50, so narrowing down doesn't feel
 * arbitrarily truncated. Sortable client-side (date is the only sort
 * key, applied after this query returns).
 */

export const recentActivity = internalQuery({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    eventType: v.optional(v.string()),
    participantId: v.optional(v.id("participants")),
    sinceDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const isFiltered = Boolean(args.campaignId || args.eventType || args.participantId || args.sinceDays);
    const limit = isFiltered ? 50 : 10;
    const cutoff = args.sinceDays ? Date.now() - args.sinceDays * 24 * 60 * 60 * 1000 : undefined;

    let events;
    if (args.eventType) {
      events = await ctx.db
        .query("events")
        .withIndex("by_type", (q) => q.eq("type", args.eventType as "EMAIL_SENT" | "LINK_CLICKED"))
        .collect();
    } else {
      const [sentEvents, clickEvents] = await Promise.all([
        ctx.db.query("events").withIndex("by_type", (q) => q.eq("type", "EMAIL_SENT")).collect(),
        ctx.db.query("events").withIndex("by_type", (q) => q.eq("type", "LINK_CLICKED")).collect(),
      ]);
      events = [...sentEvents, ...clickEvents];
    }

    if (cutoff) {
      events = events.filter((e) => e.occurredAt >= cutoff);
    }

    events.sort((a, b) => b.occurredAt - a.occurredAt);

    const rows = await Promise.all(
      events.map(async (event) => {
        const assignment = await ctx.db.get(event.assignmentId);
        if (!assignment) return null;
        if (args.campaignId && assignment.campaignId !== args.campaignId) return null;
        if (args.participantId && assignment.participantId !== args.participantId) return null;

        const [campaign, participant] = await Promise.all([
          ctx.db.get(assignment.campaignId),
          ctx.db.get(assignment.participantId),
        ]);

        return {
          eventId: event._id,
          assignmentId: event.assignmentId,
          campaignId: assignment.campaignId,
          campaignName: campaign?.name ?? "(removed)",
          participantId: assignment.participantId,
          participantName: participant ? `${participant.firstName} ${participant.surname}` : "(removed)",
          department: participant?.department ?? "",
          eventType: event.type,
          occurredAt: event.occurredAt,
        };
      })
    );

    return rows.filter((r) => r !== null).slice(0, limit);
  },
});