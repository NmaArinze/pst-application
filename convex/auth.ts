/// <reference types="node" />


import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

// Business rule (not a secret) — sessions expire after 30 minutes.
const SESSION_DURATION_MS = 30 * 60 * 1000;

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  const hashHex = [...new Uint8Array(derivedBits)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const saltOut = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");

  return `${saltOut}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string) {
  const [saltHex] = stored.split(":");
  const recomputed = await hashPassword(password, saltHex);
  return recomputed === stored;
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- One-off setup: create the first administrator account ---
// Run manually, once, via the Convex dashboard's "Run a function" tool.
// Guarded by ADMIN_SETUP_KEY (an environment variable you set yourself) —
// no email/password/key is ever written in this file.
export const createAdministrator = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    setupKey: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ADMIN_SETUP_KEY;
    if (!expectedKey || args.setupKey !== expectedKey) {
      throw new Error("Invalid setup key.");
    }

    const existing = await ctx.db
      .query("administrators")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      throw new Error("An administrator with this email already exists.");
    }

    const passwordHash = await hashPassword(args.password);

    await ctx.db.insert("administrators", {
      email: args.email,
      passwordHash,
      name: args.name,
      active: true,
      createdAt: Date.now(),
    });

    return { status: "created" };
  },
});

// --- Internal only — NOT callable directly from the browser. ---
// Only convex/http.ts (the HTTP Action layer) is allowed to call these,
// which is what lets us control the Set-Cookie header around them.

export const login = internalMutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("administrators")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    const genericError = "Invalid email or password.";

    if (!admin || !admin.active) {
      throw new Error(genericError);
    }

    const passwordOk = await verifyPassword(args.password, admin.passwordHash);
    if (!passwordOk) {
      throw new Error(genericError);
    }

    const token = generateToken();
    const now = Date.now();

    await ctx.db.insert("sessions", {
      administratorId: admin._id,
      token,
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
    });

    await ctx.db.patch(admin._id, { lastLoginAt: now });

    return { token, expiresAt: now + SESSION_DURATION_MS, name: admin.name };
  },
});

export const validateSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session || session.expiresAt < Date.now()) {
      return { valid: false };
    }

    const admin = await ctx.db.get(session.administratorId);
    if (!admin || !admin.active) {
      return { valid: false };
    }

    return { valid: true, name: admin.name, email: admin.email };
  },
});

export const logout = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session) {
      await ctx.db.delete(session._id);
    }

    return { status: "logged_out" };
  },
});