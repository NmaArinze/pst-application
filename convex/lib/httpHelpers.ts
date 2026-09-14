/**
 * convex/lib/httpHelpers.ts
 *
 * Small reusable building blocks for convex/http.ts routes: JSON
 * responses, CORS preflight handling, and a wrapper that combines
 * "check the session" + "run the handler" + "catch errors and return a
 * clean 400/401" into one call.
 *
 * WHY THIS EXISTS:
 * Without this, every route in http.ts repeats the same requireAdmin()
 * check, the same try/catch, and the same response-shape boilerplate.
 * As PST grows (templates, campaigns, assignments, email queue,
 * tracking — Phases 5-10), that repetition would make http.ts hundreds
 * of near-identical lines. This file is where that shared shape lives
 * instead, once.
 *
 * CONNECTS TO:
 * - convex/lib/authHttp.ts — requireAdmin()/corsHeaders(), used here.
 * - convex/http.ts — every route imports json()/preflight()/authedRoute()
 *   from here rather than rebuilding this logic per-route.
 */

import { httpAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { requireAdmin, corsHeaders } from "./authHttp";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";

/** Standard JSON response, with CORS headers applied automatically. */
export function json(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

/** Standard OPTIONS (CORS preflight) handler — attach to every route path. */
export function preflight() {
  return httpAction(async (_ctx, request: Request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  });
}

type AuthedHandler = (
  ctx: ActionCtx,
  request: Request,
  admin: { name: string; email: string; administratorId: Id<"administrators">}
) => Promise<Response>;

/**
 * Wraps a route handler with the standard protected-route shape:
 *   1. Validate the session cookie (requireAdmin) — 401 if invalid.
 *   2. Run the handler.
 *   3. Catch any thrown error (e.g. a Convex validation error from a
 *      malformed ID, or a business-rule error like "duplicate email")
 *      and return it as a clean 400 JSON response instead of crashing.
 *
 * This is what every protected route in http.ts should use — it's the
 * concrete mechanism behind the locked rule that business data is never
 * touched without a validated session first.
 */
export function authedRoute(handler: AuthedHandler) {
  return httpAction(async (ctx, request: Request) => {
    const admin = await requireAdmin(ctx, request);
    if (!admin) {
      return json({ error: "Not authenticated." }, 401, request);
    }
    try {
      return await handler(ctx, request, admin);
    } catch (err: any) {
      const message = 
        err instanceof ConvexError ? (err.data as string) : "Request failed. Please try again.";
      return json({ error: message }, 400, request);
    }
  });
}