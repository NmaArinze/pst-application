/**
 * convex/lib/authHttp.ts
 *
 * Core identity check for PST's HTTP Action layer: reads the HttpOnly
 * session cookie and validates it against the `sessions` table.
 *
 * WHY THIS EXISTS:
 * Convex's WebSocket client cannot carry our HttpOnly cookie, so every
 * protected operation is reached through a real HTTP route instead
 * (see convex/http.ts). requireAdmin() is the one place that check
 * lives — every protected route relies on it, indirectly, through
 * convex/lib/httpHelpers.ts's authedRoute() wrapper.
 *
 * CONNECTS TO:
 * - convex/auth.ts (internal.auth.validateSession) — Phase 2 logic,
 *   reused here unchanged.
 * - convex/lib/httpHelpers.ts — authedRoute() calls requireAdmin() as
 *   its first step.
 */

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const SESSION_COOKIE_NAME = "pst_session";

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

/**
 * Returns the authenticated administrator's { name, email } if the
 * request carries a valid, unexpired session cookie — otherwise null.
 * Callers must treat null as "reject this request", never proceed.
 */
export async function requireAdmin(
  ctx: ActionCtx,
  request: Request
): Promise<{ name: string; email: string; administratorId: Id<"administrators">} | null> {
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE_NAME];
  if (!token) return null;

  const result = await ctx.runQuery(internal.auth.validateSession, { token });
  if (!result.valid) return null;

  return { name: result.name!, email: result.email!, administratorId: result.administratorId! };
}

/**
 * Standard CORS headers for every PST HTTP Action response. Allowed
 * origin comes from PST_FRONTEND_ORIGIN (set per-deployment in Phase 2)
 * — never hardcoded, so this is identical across dev and production.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowedOrigin = process.env.PST_FRONTEND_ORIGIN;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (allowedOrigin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }
  return headers;
}