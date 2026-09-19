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
import { openDrawer , closeDrawer } from "./ui/drawer.js";

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

  renderAssignmentsSection(campaign);
}

async function renderAssignmentsSection(campaign) {
  const container = document.createElement("div");
  container.className = "panel";
  container.style.cssText = "max-width:720px;margin-top:16px;";
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:600;">Assigned participants</div>
      ${
        campaign.status === "COMPLETED" || campaign.status === "CANCELLED"
          ? ""
          : `<button id="add-assignees-btn" class="btn btn--primary" style="padding:6px 12px;font-size:12.5px;">Add participants</button>`
      }
    </div>
    <div id="assignments-table"></div>`;

  document.getElementById("campaign-body").appendChild(container);

  const addBtn = container.querySelector("#add-assignees-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => openAssignParticipantsDrawer(campaign._id));
  }

  await loadAssignments(campaign._id);
}

async function renderQueueSummary(campaign) {
  const container = document.createElement("div");
  container.className = "panel";
  container.style.cssText = "max-width:720px;margin-top:16px;";
  container.innerHTML = `<div class="table-empty">Loading queue summary…</div>`;
  document.getElementById("campaign-body").appendChild(container);

  try {
    const summary = await apiGet("/email-queue/summary", { campaignId: campaign._id });
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:13px;">
          <strong>${summary.total}</strong> total —
          <strong>${summary.counts.NOT_SENT}</strong> pending,
          <strong>${summary.counts.SENT}</strong> sent,
          <strong>${summary.counts.DELIVERED}</strong> delivered
          ${summary.counts.FAILED > 0 ? `, <strong style="color:var(--color-status-danger);">${summary.counts.FAILED}</strong> failed` : ""}
        </div>
        <a href="email-queue.html?campaignId=${campaign._id}" class="btn btn--secondary" style="padding:6px 12px;font-size:12.5px;">
          View Email Queue
        </a>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load queue summary.</div>`;
    console.error("Failed to load queue summary:", err);
  }
}

async function loadAssignments(campaignId) {
  const container = document.getElementById("assignments-table");
  container.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const assignments = await apiGet("/campaign-assignments/list", { campaignId });

    if (assignments.length === 0) {
      container.innerHTML = `<div class="table-empty">No participants assigned yet.</div>`;
      return;
    }

    const rowsHtml = assignments
      .map(
        (a) => `
        <tr>
          <td>${a.participantName}</td>
          <td>${a.participantEmail}</td>
          <td>${a.participantDepartment}</td>
          <td><span class="status-pill status-pill--inactive">${a.emailStatus}</span></td>
        </tr>`
      )
      .join("");

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Email status</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load assignments: ${err.message}</div>`;
    console.error("Failed to load assignments:", err);
  }
}

async function openAssignParticipantsDrawer(campaignId) {
  let unassigned = [];
  try {
    unassigned = await apiGet("/campaign-assignments/unassigned", { campaignId });
  } catch (err) {
    console.error("Failed to load unassigned participants:", err);
  }

  if (unassigned.length === 0) {
    openDrawer(`
      <h2>Add participants</h2>
      <p style="font-size:13px;color:var(--color-text-muted);">
        No active, unassigned participants are available. Everyone active is already assigned, or add more participants first.
      </p>`);
    return;
  }

  const checkboxesHtml = unassigned
    .map(
      (p) => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
        <input type="checkbox" class="assignee-checkbox" value="${p._id}" />
        <span>${p.firstName} ${p.surname} — <span style="color:var(--color-text-faint);">${p.email}</span></span>
      </label>`
    )
    .join("");

  const html = `
    <h2>Add participants</h2>
    <div id="assign-error" class="inline-error"></div>
    <div id="assign-result" class="inline-error" style="background:#e7f1ee;color:var(--color-status-success);"></div>
    <div style="max-height:320px;overflow-y:auto;margin-bottom:16px;">${checkboxesHtml}</div>
    <div class="drawer-actions">
      <button id="assign-submit-btn" class="btn btn--primary">Assign selected</button>
    </div>`;

  const drawerEl = openDrawer(html);
  drawerEl.querySelector("#assign-submit-btn").addEventListener("click", () =>
    handleAssignParticipants(campaignId, drawerEl)
  );
}

async function handleAssignParticipants(campaignId, drawerEl) {
  const selectedIds = [...drawerEl.querySelectorAll(".assignee-checkbox:checked")].map((cb) => cb.value);
  const errorEl = drawerEl.querySelector("#assign-error");
  const resultEl = drawerEl.querySelector("#assign-result");

  if (selectedIds.length === 0) {
    errorEl.textContent = "Select at least one participant.";
    errorEl.classList.add("inline-error--visible");
    return;
  }

  try {
    const result = await apiPost("/campaign-assignments/assign", {
      campaignId,
      participantIds: selectedIds,
    });

    const parts = [`${result.assigned} assigned`];
    if (result.skipped > 0) parts.push(`${result.skipped} already assigned`);
    if (result.invalid > 0) parts.push(`${result.invalid} no longer active`);

    resultEl.textContent = parts.join(", ") + ".";
    resultEl.classList.add("inline-error--visible");

    await loadAssignments(campaignId);

    setTimeout(() => closeDrawer(), 1500);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add("inline-error--visible");
  }
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