/**
 * src/js/lib/api.js
 *
 * Shared authenticated-fetch helper for calling PST's Convex HTTP
 * Action routes (convex/http.ts) from any page.
 *
 * WHY THIS EXISTS:
 * Every protected route needs the request sent with
 * credentials: "include" (so the HttpOnly session cookie is attached),
 * and every page needs the same reaction to a 401: the session has
 * expired or was never valid, so redirect to login.html. Without this
 * shared helper, that logic would be copy-pasted into participants.js,
 * and later templates.js, campaigns.js, etc.
 *
 * CONNECTS TO:
 * - convex/http.ts — the routes this file calls.
 * - src/js/participants.js (and future pages) — import apiGet/apiPost
 *   from here rather than calling fetch() directly.
 */

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function baseUrl() {
  if (!CONVEX_SITE_URL) {
    throw new Error("VITE_CONVEX_SITE_URL is not configured.");
  }
  return CONVEX_SITE_URL;
}

async function handleResponse(res) {
  if (res.status === 401) {
    window.location.href = "login.html";
    // Throw so calling code's try/catch stops here rather than
    // continuing to process a redirect-in-progress page.
    throw new Error("Session expired.");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`);
  }

  return data;
}

/** GET request to a PST HTTP Action route. `params` becomes the query string. */
export async function apiGet(path, params = {}) {
  const url = new URL(`${baseUrl()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
  });
  return handleResponse(res);
}

/** POST request to a PST HTTP Action route, with a JSON body. */
export async function apiPost(path, body = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}