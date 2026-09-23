/**
 * convex/crons.ts
 * Runs processScheduledCampaigns every 5 minutes — Convex's own
 * scheduler, works whether or not any browser/admin is online.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "process scheduled campaigns",
  { minutes: 5 },
  internal.scheduledCampaigns.processScheduledCampaigns
);

export default crons;