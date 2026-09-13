/// <reference types="node" />

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const SESSION_COOKIE_NAME = "pst_session";
const SESSION_DURATION_SECONDS = 30 * 60; // matches auth.ts's SESSION_DURATION_MS

// The allowed frontend origin comes from an environment variable, never
// hardcoded — set via `npx convex env set PST_FRONTEND_ORIGIN <url>`.
function corsHeaders(origin: string | null) {
  const allowedOrigin = process.env.PST_FRONTEND_ORIGIN;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (allowedOrigin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }
  return headers;
}

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

http.route({
  path: "/auth/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = corsHeaders(request.headers.get("Origin"));
    try {
      const { email, password } = await request.json();
      const result = await ctx.runMutation(internal.auth.login, { email, password });
      const cookie = `${SESSION_COOKIE_NAME}=${result.token}; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_DURATION_SECONDS}; Path=/`;
      return new Response(JSON.stringify({ name: result.name, expiresAt: result.expiresAt }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": cookie, ...cors },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
  }),
});

http.route({
  path: "/auth/login",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin")) });
  }),
});

http.route({
  path: "/auth/session",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const cors = corsHeaders(request.headers.get("Origin"));
    const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE_NAME];

    if (!token) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const result = await ctx.runQuery(internal.auth.validateSession, { token });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }),
});

http.route({
  path: "/auth/session",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin")) });
  }),
});

http.route({
  path: "/auth/logout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = corsHeaders(request.headers.get("Origin"));
    const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE_NAME];

    if (token) {
      await ctx.runMutation(internal.auth.logout, { token });
    }

    const clearCookie = `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/`;
    return new Response(JSON.stringify({ status: "logged_out" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie, ...cors },
    });
  }),
});

http.route({
  path: "/auth/logout",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin")) });
  }),
});

export default http;