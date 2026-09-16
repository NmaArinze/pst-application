/**
 * src/js/campaign-detail.js
 * Single-campaign detail page (campaign-detail.html?id=<campaignId>):
 * shows campaign info and exposes status-transition buttons (Launch,
 * Complete, Cancel, etc.), each calling /campaigns/transition-status.
 * Participant assignment UI is intentionally absent — that's Phase 7.
 */

import "../css/base.css";
import "../css/table.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { confirmDialog } from "./ui/confirmDialog.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet, apiPost } from "./lib/api.js";

const STATUS_LABELS = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Mirrors convex/campaigns.ts's ALLOWED_TRANSITIONS, purely for
 * deciding which buttons to show. The server re-checks this
 * independently — this list only controls UI, never enforcement.
 */
const AVAILABLE_ACTIONS = {
  DRAFT: [
    { toStatus: "SCHEDULED", label: "Schedule", style: "btn--secondary" },
    { toStatus: "ACTIVE", label: "Launch", style: "btn--primary" },
    { toStatus: "CANCELLED", label: "Cancel", style: "btn--secondary" },
  ],
  SCHEDULED: [
    { toStatus: "ACTIVE", label: "Launch now", style: "btn--primary" },
    { toStatus: "DRAFT", label: "Move back to draft", style: "btn--secondary" },
    { toStatus: "CANCELLED", label: "Cancel", style: "btn--secondary" },
  ],
  ACTIVE: [{ toStatus: "COMPLETED", label: "Mark completed", style: "btn--primary" }],
  COMPLETED: [],
  CANCELLED: [],
};

function getCampaignIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

async function init() {
  const session = await requireSession();
  if (!session) return;

  const campaignId = getCampaignIdFromUrl();
  if (!campaignId) {
    document.getElementById("app").innerHTML = `<p style="padding:24px;">No campaign specified.</p>`;
    return;
  }

  renderShell(session);
  await loadCampaign(campaignId);
}

function renderShell(session) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("campaigns")}
      <main class="main">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <a href="campaigns.html" style="font-size:12.5px;color:var(--color-text-faint);">&larr; Back to campaigns</a>
            <h1 id="campaign-title" style="margin-top:4px;">Loading…</h1>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:500;color:var(--color-text);">${session.name}</div>
            <button id="logout-btn" class="btn btn--secondary" style="margin-top:6px;padding:5px 12px;font-size:12px;">
              Log out
            </button>
          </div>
        </div>
        <div id="campaign-body"></div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);
}

async function loadCampaign(campaignId) {
  const body = document.getElementById("campaign-body");
  body.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const campaign = await apiGet("/campaigns/one", { id: campaignId });
    renderCampaign(campaign);
  } catch (err) {
    body.innerHTML = `<div class="table-empty">Could not load campaign: ${err.message}</div>`;
    console.error("Failed to load campaign:", err);
  }
}

function renderCampaign(campaign) {
  document.getElementById("campaign-title").textContent = campaign.name;

  const actions = AVAILABLE_ACTIONS[campaign.status] || [];
  const actionsHtml = actions
    .map(
      (a) =>
        `<button class="btn ${a.style}" data-to-status="${a.toStatus}" style="margin-right:8px;">${a.label}</button>`
    )
    .join("");

  const scheduledLine =
    campaign.sendingMode === "SCHEDULED" && campaign.scheduledAt
      ? `<div class="drawer-field"><label>Scheduled for</label><div>${new Date(campaign.scheduledAt).toLocaleString()}</div></div>`
      : "";

  document.getElementById("campaign-body").innerHTML = `
    <div class="panel" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span class="status-pill ${campaign.status === "ACTIVE" ? "status-pill--active" : "status-pill--inactive"}">
          ${STATUS_LABELS[campaign.status] || campaign.status}
        </span>
      </div>
      <div id="transition-error" class="inline-error"></div>
      <div class="drawer-field"><label>Template</label><div>${campaign.templateName}</div></div>
      <div class="drawer-field"><label>Sending mode</label><div>${campaign.sendingMode === "SCHEDULED" ? "Scheduled" : "Manual"}</div></div>
      ${scheduledLine}
      <div style="margin-top:20px;">${actionsHtml || `<span style="font-size:13px;color:var(--color-text-faint);">No further actions available.</span>`}</div>
    </div>`;
    
  document.querySelectorAll("[data-to-status]").forEach((btn) => {
    btn.addEventListener("click", () => handleTransition(campaign._id, btn.dataset.toStatus, btn.textContent));
  });
}

async function handleTransition(campaignId, toStatus, actionLabel) {
  const confirmed = await confirmDialog({
    title: `${actionLabel}?`,
    message: `Are you sure you want to change this campaign's status to ${STATUS_LABELS[toStatus] || toStatus}?`,
    confirmLabel: actionLabel,
  });
  if (!confirmed) return;

  try {
    await apiPost("/campaigns/transition-status", { id: campaignId, toStatus });
    await loadCampaign(campaignId);
  } catch (err) {
    const errorEl = document.getElementById("transition-error");
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.add("inline-error--visible");
    }
    alert(err.message); // simple fallback here; drawer-style error UI isn't applicable on this page's layout
  }
}

init();