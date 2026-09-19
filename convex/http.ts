/**
 * convex/http.ts
 *
 * PST's public HTTP surface — every route is a real HTTP endpoint at
 * https://<deployment>.convex.site/... reachable via fetch() from the
 * frontend, carrying the HttpOnly session cookie.
 *
 * WHY THIS EXISTS:
 * See convex/lib/authHttp.ts and convex/lib/httpHelpers.ts for the
 * underlying mechanism. This file just declares routes and wires each
 * one to its internal query/mutation, using authedRoute() to enforce
 * the locked rule: no business data without a validated session.
 *
 * CONNECTS TO:
 * - convex/auth.ts — login/session/logout (Phase 2)
 * - convex/participants.ts — participant CRUD (Phase 4)
 * - convex/templates.ts — template CRUD (Phase 5)
 * - convex/campaigns.ts — campaign lifecycle management (Phase 6)
 * - convex/campaignsAssignments.ts — assign participants to campaigns (Phase 7)
 * - convex/emailQueue.ts — send emails, plus queue visibility (Phase 8)
 * - convex/lib/authHttp.ts, convex/lib/httpHelpers.ts — shared helpers
 * - src/js/lib/api.js (frontend) — calls these routes
 *
 * Adding a new protected feature in a later phase (templates,
 * campaigns, etc.) means adding routes here using authedRoute() —
 * not writing the auth check by hand again.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { corsHeaders } from "./lib/authHttp";
import { json, preflight, authedRoute } from "./lib/httpHelpers";
import { ConvexError } from "convex/values";

const SESSION_COOKIE_NAME = "pst_session";
const SESSION_DURATION_SECONDS = 30 * 60; // matches auth.ts's SESSION_DURATION_MS

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return out;
}

const http = httpRouter();

// ============================================================
// AUTH ROUTES (Phase 2) — not wrapped in authedRoute(), since login
// itself is how a session comes to exist in the first place.
// ============================================================

http.route({
  path: "/auth/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { email, password } = await request.json();
      const result = await ctx.runMutation(internal.auth.login, { email, password });
      const cookie = `${SESSION_COOKIE_NAME}=${result.token}; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_DURATION_SECONDS}; Path=/`;
      return new Response(JSON.stringify({ name: result.name, expiresAt: result.expiresAt }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": cookie, ...corsHeaders(request) },
      });
    } catch {
      return json({ error: "Invalid email or password." }, 401, request);
    }
  }),
});
http.route({ path: "/auth/login", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/auth/session",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE_NAME];
    if (!token) return json({ valid: false }, 200, request);

    const result = await ctx.runQuery(internal.auth.validateSession, { token });
    return json(result, 200, request);
  }),
});
http.route({ path: "/auth/session", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/auth/logout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE_NAME];
    if (token) await ctx.runMutation(internal.auth.logout, { token });

    const clearCookie = `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/`;
    return new Response(JSON.stringify({ status: "logged_out" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie, ...corsHeaders(request) },
    });
  }),
});
http.route({ path: "/auth/logout", method: "OPTIONS", handler: preflight() });

// ============================================================
// PARTICIPANT ROUTES (Phase 4)
// Every route uses authedRoute() — see httpHelpers.ts for what that
// enforces (session check, then error handling).
// ============================================================

http.route({
  path: "/participants/list",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const department = url.searchParams.get("department") || undefined;
    const activeParam = url.searchParams.get("active");
    const active = activeParam === null ? undefined : activeParam === "true";
    const search = url.searchParams.get("search") || undefined;

    const results = await ctx.runQuery(internal.participants.list, { department, active, search });
    return json(results, 200, request);
  }),
});
http.route({ path: "/participants/list", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/participants/one",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const rawId = url.searchParams.get("id");
    if (!rawId) throw new ConvexError("Missing id.");

    // Cast to the specific table's Id type (not `any`) — Convex's own
    // v.id("participants") validator on the internal query still checks
    // the value is really a valid participants ID at runtime; if it
    // isn't, that throws and authedRoute() turns it into a clean 400.
    const result = await ctx.runQuery(internal.participants.get, {
      id: rawId as Id<"participants">,
    });
    if (!result) throw new ConvexError("Participant not found.");
    return json(result, 200, request);
  }),
});
http.route({ path: "/participants/one", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/participants/create",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { firstName, surname,email, department } = await request.json();
    const result = await ctx.runMutation(internal.participants.create, { firstName, surname, email, department });
    return json(result, 201, request);
  }),
});
http.route({ path: "/participants/create", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/participants/update",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { id, firstName, surname, email, department } = await request.json();
    if (!id) throw new ConvexError("Missing id.");

    const result = await ctx.runMutation(internal.participants.update, {
      id: id as Id<"participants">,
      firstName,
      surname,
      email,
      department,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/participants/update", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/participants/set-active",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { id, active } = await request.json();
    if (!id) throw new ConvexError("Missing id.");
    if (typeof active !== "boolean") throw new ConvexError("`active` must be true or false.");

    const result = await ctx.runMutation(internal.participants.setActive, {
      id: id as Id<"participants">,
      active,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/participants/set-active", method: "OPTIONS", handler: preflight() });

// ============================================================
// TEMPLATE ROUTES (Phase 5)
// Every route uses authedRoute() — session checked first, business
// logic (convex/templates.ts) only runs after that succeeds.
// ============================================================

http.route({
  path: "/templates/list",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const activeParam = url.searchParams.get("active");
    const active = activeParam === null ? undefined : activeParam === "true";

    const results = await ctx.runQuery(internal.templates.list, { active });
    return json(results, 200, request);
  }),
});
http.route({ path: "/templates/list", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/templates/one",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const rawId = url.searchParams.get("id");
    if (!rawId) throw new ConvexError("Missing id.");

    const result = await ctx.runQuery(internal.templates.get, {
      id: rawId as Id<"templates">,
    });
    if (!result) throw new Error("Template not found.");
    return json(result, 200, request);
  }),
});
http.route({ path: "/templates/one", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/templates/create",
  method: "POST",
  handler: authedRoute(async (ctx, request, admin) => {
    const { name, description, emailSubject, senderName, resendTemplateId } = await request.json();
    const result = await ctx.runMutation(internal.templates.create, {
      name,
      description,
      emailSubject,
      senderName,
      resendTemplateId,
      createdByAdministratorId: admin.administratorId,
    });
    return json(result, 201, request);
  }),
});
http.route({ path: "/templates/create", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/templates/update",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { id, name, description, emailSubject, senderName, resendTemplateId } = await request.json();
    if (!id) throw new Error("Missing id.");

    const result = await ctx.runMutation(internal.templates.update, {
      id: id as Id<"templates">,
      name,
      description,
      emailSubject,
      senderName,
      resendTemplateId,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/templates/update", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/templates/set-active",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { id, active } = await request.json();
    if (!id) throw new Error("Missing id.");
    if (typeof active !== "boolean") throw new Error("`active` must be true or false.");

    const result = await ctx.runMutation(internal.templates.setActive, {
      id: id as Id<"templates">,
      active,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/templates/set-active", method: "OPTIONS", handler: preflight() });

// ============================================================
// CAMPAIGN ROUTES (Phase 6)
// Status changes only ever go through transitionStatus — never a
// direct patch — so illegal transitions are rejected server-side.
// ============================================================

http.route({
  path: "/campaigns/list",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const results = await ctx.runQuery(internal.campaigns.list, { status });
    return json(results, 200, request);
  }),
});
http.route({ path: "/campaigns/list", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/campaigns/one",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const rawId = url.searchParams.get("id");
    if (!rawId) throw new ConvexError("Missing id.");

    const result = await ctx.runQuery(internal.campaigns.get, { id: rawId as Id<"campaigns"> });
    if (!result) throw new ConvexError("Campaign not found.");
    return json(result, 200, request);
  }),
});
http.route({ path: "/campaigns/one", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/campaigns/create",
  method: "POST",
  handler: authedRoute(async (ctx, request, admin) => {
    const { name, templateId, sendingMode, scheduledAt } = await request.json();
    const result = await ctx.runMutation(internal.campaigns.create, {
      name,
      templateId: templateId as Id<"templates">,
      sendingMode,
      scheduledAt,
      createdByAdministratorId: admin.administratorId,
    });
    return json(result, 201, request);
  }),
});
http.route({ path: "/campaigns/create", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/campaigns/update",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { id, name, templateId, sendingMode, scheduledAt } = await request.json();
    if (!id) throw new ConvexError("Missing id.");

    const result = await ctx.runMutation(internal.campaigns.update, {
      id: id as Id<"campaigns">,
      name,
      templateId: templateId as Id<"templates">,
      sendingMode,
      scheduledAt,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/campaigns/update", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/campaigns/transition-status",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { id, toStatus } = await request.json();
    if (!id) throw new ConvexError("Missing id.");
    if (!toStatus) throw new ConvexError("Missing toStatus.");

    const result = await ctx.runMutation(internal.campaigns.transitionStatus, {
      id: id as Id<"campaigns">,
      toStatus,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/campaigns/transition-status", method: "OPTIONS", handler: preflight() });

// ============================================================
// CAMPAIGN ASSIGNMENT ROUTES (Phase 7)
// ============================================================

http.route({
  path: "/campaign-assignments/list",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    if (!campaignId) throw new ConvexError("Missing campaignId.");

    const result = await ctx.runQuery(internal.campaignAssignments.listForCampaign, {
      campaignId: campaignId as Id<"campaigns">,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/campaign-assignments/list", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/campaign-assignments/unassigned",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    if (!campaignId) throw new ConvexError("Missing campaignId.");

    const result = await ctx.runQuery(internal.campaignAssignments.listUnassignedActiveParticipants, {
      campaignId: campaignId as Id<"campaigns">,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/campaign-assignments/unassigned", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/campaign-assignments/assign",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { campaignId, participantIds } = await request.json();
    if (!campaignId) throw new ConvexError("Missing campaignId.");
    if (!Array.isArray(participantIds)) throw new ConvexError("participantIds must be an array.");

    const result = await ctx.runMutation(internal.campaignAssignments.assignParticipants, {
      campaignId: campaignId as Id<"campaigns">,
      participantIds: participantIds as Id<"participants">[],
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/campaign-assignments/assign", method: "OPTIONS", handler: preflight() });

// ============================================================
// EMAIL QUEUE ROUTES (Phase 8 — stubbed send, real Resend in Phase 9)
// ============================================================

http.route({
  path: "/email-queue/list",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId") || undefined;
    const emailStatus = url.searchParams.get("emailStatus") || undefined;

    const result = await ctx.runQuery(internal.emailQueue.list, {
      campaignId: campaignId as Id<"campaigns"> | undefined,
      emailStatus,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/email-queue/list", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/email-queue/summary",
  method: "GET",
  handler: authedRoute(async (ctx, request) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    if (!campaignId) throw new ConvexError("Missing campaignId.");

    const result = await ctx.runQuery(internal.emailQueue.summaryForCampaign, {
      campaignId: campaignId as Id<"campaigns">,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/email-queue/summary", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/email-queue/send-one",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { assignmentId } = await request.json();
    if (!assignmentId) throw new ConvexError("Missing assignmentId.");

    const result = await ctx.runAction(internal.emailQueue.sendOne, {
      assignmentId: assignmentId as Id<"campaignAssignments">,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/email-queue/send-one", method: "OPTIONS", handler: preflight() });

http.route({
  path: "/email-queue/send-pending",
  method: "POST",
  handler: authedRoute(async (ctx, request) => {
    const { campaignId } = await request.json();
    if (!campaignId) throw new ConvexError("Missing campaignId.");

    const result = await ctx.runAction(internal.emailQueue.sendPendingForCampaign, {
      campaignId: campaignId as Id<"campaigns">,
    });
    return json(result, 200, request);
  }),
});
http.route({ path: "/email-queue/send-pending", method: "OPTIONS", handler: preflight() });

export default http;