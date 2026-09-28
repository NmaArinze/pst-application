/**
 * convex/lib/resend.ts
 * Centralized Resend API client. All sending flows through here — no
 * per-template or per-route Resend calls elsewhere. Reads
 * RESEND_API_KEY/PST_FROM_EMAIL/PST_TRACKING_DOMAIN from environment
 * config only.
 *
 * NOTE: Resend reserves the variable name "FIRST_NAME" for its own
 * contact/audience fields (confirmed against Resend's current live
 * docs — Template Variables guide, Create/Update Template API
 * reference) — it cannot be used as a custom transactional-template
 * variable. We send it as PARTICIPANT_FIRST_NAME instead; the value
 * still comes from participants.firstName exactly as the spec
 * requires, only the Resend-side key name differs.
 */

interface SendEmailArgs {
  to: string;
  firstName: string;
  trackingToken: string;
  resendTemplateId: string;
  senderName: string;
}

/**
 * Builds the tracking URL for one assignment. Domain comes from
 * PST_TRACKING_DOMAIN (currently the stable Vercel domain, swappable
 * later without touching token generation, which is unchanged from
 * Phase 7). Trailing slash on the configured domain is stripped so a
 * misconfigured value can't produce a double slash in the URL.
 */
export function buildTrackingUrl(trackingToken: string): string {
  const domain = process.env.PST_TRACKING_DOMAIN?.replace(/\/+$/, "");
  if (!domain) {
    throw new Error("PST_TRACKING_DOMAIN is not configured.");
  }
  return `${domain}/email/${trackingToken}`;
}

/**
 * Sends one email via Resend using a saved Template (id + variables).
 * Throws on failure — callers (emailQueue.ts) catch this and record a
 * FAILED status with the error message, rather than letting it
 * propagate as an unhandled error.
 */
export async function sendViaResend(args: SendEmailArgs): Promise<{ resendId: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PST_FROM_EMAIL;

  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  if (!fromEmail) throw new Error("PST_FROM_EMAIL is not configured.");

  const trackingUrl = buildTrackingUrl(args.trackingToken);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${args.senderName} <${fromEmail}>`,
      to: args.to,
      template: {
        id: args.resendTemplateId,
        variables: {
          PARTICIPANT_FIRST_NAME: args.firstName,
          TRACKING_URL: trackingUrl,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return { resendId: data.id };
}

/**
 * Sends a plain HTML email (not a saved Resend Template) — used for
 * transactional messages PST authors itself, like password resets.
 * Same credentials/from-address as sendViaResend, different Resend
 * API call shape (raw html instead of template+variables).
 */
export async function sendPlainEmail(args: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PST_FROM_EMAIL;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  if (!fromEmail) throw new Error("PST_FROM_EMAIL is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `PST Security <${fromEmail}>`,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }
}