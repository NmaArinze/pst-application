/** convex/reports.ts
 * Campaign / Department / Template performance
 * + Click Rate by Campaign. All metrics are filtered by the shared start/end range.
 *
 * Definitions:
 *
 * Emails Sent:
 *   Assignments with status SENT, DELIVERED, or BOUNCED
 *   whose sentAt timestamp is within the selected range.
 *
 * Click Count:
 *   Distinct assignments within the selected range that have
 *   at least one LINK_CLICKED event within the selected range.
 *
 * Click Rate:
 *   Click Count / Emails Sent.
 *
 * Template Campaigns Used:
 *   Number of campaigns that have used the template across all time.
 */

import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

const SENT_STATUSES = new Set([
  "SENT",
  "DELIVERED",
  "BOUNCED",
]);

function inRange(
  timestamp: number | undefined,
  start?: number,
  end?: number
) {
  if (timestamp === undefined) {
    return false;
  }

  if (start !== undefined && timestamp < start) {
    return false;
  }

  if (end !== undefined && timestamp > end) {
    return false;
  }

  return true;
}

function calculateClickRate(
  clicks: number,
  sent: number
) {
  if (sent <= 0) {
    return 0;
  }

  return Math.round((clicks / sent) * 100);
}

export const getReports = internalQuery({
  args: {
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  },

  handler: async (ctx, args) => {
    const { start, end } = args;

    const [
      campaigns,
      templates,
      participants,
      assignments,
      clickEvents,
    ] = await Promise.all([
      ctx.db.query("campaigns").collect(),

      ctx.db.query("templates").collect(),

      ctx.db.query("participants").collect(),

      ctx.db.query("campaignAssignments").collect(),

      ctx.db
        .query("events")
        .withIndex("by_type", (q) =>
          q.eq("type", "LINK_CLICKED")
        )
        .collect(),
    ]);

    const campaignById = new Map(
      campaigns.map((campaign) => [
        campaign._id,
        campaign,
      ])
    );

    const templateById = new Map(
      templates.map((template) => [
        template._id,
        template,
      ])
    );

    const participantById = new Map(
      participants.map((participant) => [
        participant._id,
        participant,
      ])
    );

    /* Relevant assignments */

    const relevantAssignments = assignments.filter(
      (assignment) =>
        SENT_STATUSES.has(assignment.emailStatus) &&
        inRange(assignment.sentAt, start, end)
    );

    const relevantAssignmentIds = new Set(
      relevantAssignments.map(
        (assignment) => assignment._id
      )
    );

    /* Clicked assignments
     * Each assignment counts only once, regardless of how many
     * LINK_CLICKED events it has.
    */
    const clickedAssignmentIds = new Set(
      clickEvents
        .filter(
          (event) =>
            inRange(
              event.occurredAt,
              start,
              end
            ) &&
            relevantAssignmentIds.has(
              event.assignmentId
            )
        )
        .map(
          (event) => event.assignmentId
        )
    );

    /*
     * Campaign performance
     */
    const campaignStats = new Map();

    for (const assignment of relevantAssignments) {
      const stat =
        campaignStats.get(
          assignment.campaignId
        ) || {
          sent: 0,
          clicks: 0,
        };

      stat.sent++;

      if (
        clickedAssignmentIds.has(
          assignment._id
        )
      ) {
        stat.clicks++;
      }

      campaignStats.set(
        assignment.campaignId,
        stat
      );
    }

    const campaignPerformance = [
      ...campaignStats.entries(),
    ].map(([campaignId, stat]) => {
      const campaign =
        campaignById.get(campaignId);

      return {
        campaignId,

        campaignName:
          campaign?.name ?? "(removed)",

        status:
          campaign?.status ?? "UNKNOWN",

        emailsSent: stat.sent,

        clickCount: stat.clicks,

        clickRate: calculateClickRate(
          stat.clicks,
          stat.sent
        ),
      };
    });

    /*
     * ------------------------------------------------------------
     * Department performance
     * ------------------------------------------------------------
     */
    const departmentStats = new Map();

    for (const assignment of relevantAssignments) {
      const participant =
        participantById.get(
          assignment.participantId
        );

      const department =
        participant?.department ??
        "(unknown)";

      const stat =
        departmentStats.get(department) ||
        {
          sent: 0,
          clicks: 0,
          participantIds: new Set(),
        };

      stat.sent++;

      if (
        clickedAssignmentIds.has(
          assignment._id
        )
      ) {
        stat.clicks++;
      }

      stat.participantIds.add(
        assignment.participantId
      );

      departmentStats.set(
        department,
        stat
      );
    }

    const departmentPerformance = [
      ...departmentStats.entries(),
    ]
      .map(([department, stat]) => ({
        department,

        participantsTested:
          stat.participantIds.size,

        emailsSent: stat.sent,

        clickCount: stat.clicks,

        clickRate: calculateClickRate(
          stat.clicks,
          stat.sent
        ),
      }))
      .sort(
        (a, b) =>
          b.clickRate - a.clickRate
      );

    /*
     * ------------------------------------------------------------
     * Template usage
     * ------------------------------------------------------------
     *
     * Campaigns Used is intentionally ALL-TIME.
     * ------------------------------------------------------------
     */
    const templateUsage = new Map();

    for (const campaign of campaigns) {
      const campaignSet =
        templateUsage.get(
          campaign.templateId
        ) || new Set();

      campaignSet.add(campaign._id);

      templateUsage.set(
        campaign.templateId,
        campaignSet
      );
    }

    /*
     * Range-filtered template performance.
     */
    const templateStats = new Map();

    for (const assignment of relevantAssignments) {
      const stat =
        templateStats.get(
          assignment.templateId
        ) || {
          sent: 0,
          clicks: 0,
        };

      stat.sent++;

      if (
        clickedAssignmentIds.has(
          assignment._id
        )
      ) {
        stat.clicks++;
      }

      templateStats.set(
        assignment.templateId,
        stat
      );
    }

    const templateIds = new Set([
      ...templateStats.keys(),
      ...templateUsage.keys(),
    ]);

    const templatePerformance = [
      ...templateIds,
    ].map((templateId) => {
      const template =
        templateById.get(templateId);

      const stat =
        templateStats.get(templateId) || {
          sent: 0,
          clicks: 0,
        };

      return {
        templateId,

        templateName:
          template?.name ?? "(removed)",

        /*
         * All-time number of campaigns using
         * this template.
         */
        timesUsed:
          templateUsage
            .get(templateId)
            ?.size ?? 0,

        /*
         * These remain filtered by the selected range.
         */
        emailsSent: stat.sent,

        clickCount: stat.clicks,

        clickRate: calculateClickRate(
          stat.clicks,
          stat.sent
        ),
      };
    });

    /*
     * ------------------------------------------------------------
     * Click rate by campaign
     * ------------------------------------------------------------
     * One point per campaign, ordered chronologically by launchedAt, falling back to createdAt.
     * This is campaign performance ordered over time, not a true daily/weekly time-series.
     * ------------------------------------------------------------
     */
    const trend = campaignPerformance
      .map((campaignPerformanceRow) => {
        const campaign =
          campaignById.get(
            campaignPerformanceRow.campaignId
          );

        return {
          campaignName:
            campaignPerformanceRow.campaignName,

          date:
            campaign?.launchedAt ??
            campaign?.createdAt ??
            0,

          clickRate:
            campaignPerformanceRow.clickRate,
        };
      })
      .filter(
        (point) => point.date > 0
      )
      .sort(
        (a, b) => a.date - b.date
      );

    /*
     * ------------------------------------------------------------
     * Summary
     * ------------------------------------------------------------
     */
    const totalEmailsSent =
      relevantAssignments.length;

    const totalClicks =
      relevantAssignments.filter(
        (assignment) =>
          clickedAssignmentIds.has(
            assignment._id
          )
      ).length;

    const uniqueParticipantsTested =
      new Set(
        relevantAssignments.map(
          (assignment) =>
            assignment.participantId
        )
      ).size;

    const activeCampaignsInRange =
      new Set(
        relevantAssignments.map(
          (assignment) =>
            assignment.campaignId
        )
      ).size;

    const summary = {
      totalEmailsSent,

      overallClickRate:
        calculateClickRate(
          totalClicks,
          totalEmailsSent
        ),

      activeCampaignsInRange,

      participantsTested:
        uniqueParticipantsTested,
    };

    return {
      summary,
      campaignPerformance,
      departmentPerformance,
      templatePerformance,
      trend,
    };
  },
});