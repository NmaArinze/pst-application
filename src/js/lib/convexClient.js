import { ConvexClient } from "convex/browser";

/**
 * Single shared Convex client instance for the whole frontend.
 * The deployment URL comes from environment configuration
 * (VITE_CONVEX_URL) — never hardcoded, per the approved spec.
 *
 * Every page imports this same instance rather than constructing
 * its own client, keeping the Convex connection centralized.
 */
const convexUrl = import.meta.env.VITE_CONVEX_URL;

export const convex = convexUrl ? new ConvexClient(convexUrl) : null;

export function isConvexConfigured() {
  return Boolean(convexUrl);
}