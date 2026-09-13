import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  administrators: defineTable({
    email: v.string(),
    passwordHash: v.string(), // "salt:hash" hex string — see auth.ts
    name: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    administratorId: v.id("administrators"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),
});