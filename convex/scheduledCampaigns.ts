/**
 * convex/scheduledCampaigns.ts
 * Cron-driven execution: finds SCHEDULED campaigns whose time has
 * arrived, activates them, sends pending emails. No browser open needed.
 */
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const processScheduledCampaigns = internalAction({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.runQuery(internal.campaigns.list, { status: "SCHEDULED" });
    const now = Date.now();
    const due = campaigns.filter((c: any) => c.scheduledAt && c.scheduledAt <= now);

    for (const campaign of due) {
      try {
        await ctx.runMutation(internal.campaigns.transitionStatus, {
          id: campaign._id,
          toStatus: "ACTIVE",
        });
        await ctx.runAction(internal.emailQueue.sendPendingForCampaign, {
          campaignId: campaign._id,
        });
      } catch (err) {
        console.error(`Failed to process scheduled campaign ${campaign._id}:`, err);
      }
    }

    return { processed: due.length };
  },
}); 