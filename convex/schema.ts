import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // --- Phase 2 tables (unchanged) ---
  administrators: defineTable({
    email: v.string(),
    passwordHash: v.string(),
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

  // --- Phase 3: new core data model ---

  participants: defineTable({
    participantCode: v.string(), // system-generated stable ID, unique
    firstName: v.string(),
    surname: v.string(),
    email: v.string(),
    department: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_participantCode", ["participantCode"])
    .index("by_department", ["department"])
    .index("by_active", ["active"]),

  templates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    emailSubject: v.string(),
    senderName: v.string(),
    resendTemplateId: v.string(), // reference into Resend, unique
    active: v.boolean(),
    createdBy: v.id("administrators"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_resendTemplateId", ["resendTemplateId"]),

  campaigns: defineTable({
    name: v.string(),
    templateId: v.id("templates"),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("SCHEDULED"),
      v.literal("ACTIVE"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED")
    ),
    sendingMode: v.union(v.literal("MANUAL"), v.literal("SCHEDULED")),
    scheduledAt: v.optional(v.number()), // required only when sendingMode is SCHEDULED
    createdBy: v.id("administrators"),
    createdAt: v.number(),
    updatedAt: v.number(),
    launchedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_templateId", ["templateId"]),

  campaignAssignments: defineTable({
    campaignId: v.id("campaigns"),
    participantId: v.id("participants"),
    templateId: v.id("templates"), // denormalized copy at assignment time
    trackingToken: v.string(), // cryptographically random, unique, opaque
    emailStatus: v.union(
      v.literal("NOT_SENT"),
      v.literal("QUEUED"),
      v.literal("SENT"),
      v.literal("DELIVERED"),
      v.literal("BOUNCED"),
      v.literal("FAILED")
    ),
    sentAt: v.optional(v.number()),
    lastError: v.optional(v.string()), //set on Failed, for operational troubleshooting
    createdAt: v.number(),
  })
    .index("by_campaignId", ["campaignId"])
    .index("by_participantId", ["participantId"])
    .index("by_trackingToken", ["trackingToken"])
    .index("by_campaignId_participantId", ["campaignId", "participantId"]),

  events: defineTable({
    assignmentId: v.id("campaignAssignments"),
    type: v.union(
      v.literal("EMAIL_SENT"),
      v.literal("EMAIL_DELIVERED"),
      v.literal("EMAIL_BOUNCED"),
      v.literal("EMAIL_OPENED"),
      v.literal("LINK_CLICKED")
    ),
    occurredAt: v.number(),
    metadata: v.optional(v.any()), // e.g. { userAgent, region } for LINK_CLICKED — never credentials
  })
    .index("by_assignmentId", ["assignmentId"])
    .index("by_type", ["type"])
    .index("by_occurredAt", ["occurredAt"]),

    passwordResetTokens: defineTable({
    administratorId: v.id("administrators"),
    token: v.string(),
    purpose: v.union(v.literal("PASSWORD_RESET"), v.literal("ACCOUNT_ACTIVATION")),
    expiresAt: v.number(),
    used: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_administratorId", ["administratorId"]),

});

