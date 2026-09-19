/**
 * src/js/campaigns.js
 * Campaign list page: shows all campaigns as cards, lets the admin
 * create a new one (name + template + sending mode), and links into
 * campaign-detail.html for status transitions and (Phase 7+) assignments.
 * Connects to convex/http.ts's /campaigns/* routes via lib/api.js.
 */

import "../css/base.css";
import "../css/table.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { openDrawer, closeDrawer } from "./ui/drawer.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet, apiPost } from "./lib/api.js";
import { escapeHtml } from "./ui/table.js";

const STATUS_LABELS = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

async function init() {
  const session = await requireSession();
  if (!session) return;

  renderShell(session);
  await loadCampaigns();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("campaigns")}
      <main class="main">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1>Campaigns</h1>
            <p>Phishing-awareness exercises — create, review, and launch.</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:500;color:var(--color-text);">${escapeHtml(session.name)}</div>
            <button id="logout-btn" class="btn btn--secondary" style="margin-top:6px;padding:5px 12px;font-size:12px;">
              Log out
            </button>
          </div>
        </div>

        <div class="table-toolbar">
          <div class="spacer"></div>
          <button id="add-campaign-btn" class="btn btn--primary">New campaign</button>
        </div>

        <div id="campaign-list"></div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("add-campaign-btn").addEventListener("click", openCreateCampaignDrawer);
}

async function loadCampaigns() {
  const container = document.getElementById("campaign-list");
  container.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const campaigns = await apiGet("/campaigns/list", {});
    if (campaigns.length === 0) {
      container.innerHTML = `<div class="table-empty">No campaigns yet.</div>`;
      return;
    }

    container.innerHTML = campaigns
      .map(
        (c) => `
        <div class="panel campaign-card" data-id="${c._id}" style="margin-bottom:12px;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-size:14.5px;font-weight:600;">${escapeHtml(c.name)}</div>
              <div style="font-size:12.5px;color:var(--color-text-faint);margin-top:2px;">
                ${c.sendingMode === "SCHEDULED" ? "Scheduled sending" : "Manual sending"}
              </div>
            </div>
            <span class="status-pill ${c.status === "ACTIVE" ? "status-pill--active" : "status-pill--inactive"}">
              ${STATUS_LABELS[c.status] || c.status}
            </span>
          </div>
        </div>`
      )
      .join("");

    container.querySelectorAll(".campaign-card").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.href = `campaign-detail.html?id=${card.dataset.id}`;
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load campaigns: ${err.message}</div>`;
    console.error("Failed to load campaigns:", err);
  }
}

async function openCreateCampaignDrawer() {
  let templates = [];
  try {
    templates = await apiGet("/templates/list", { active: true });
  } catch (err) {
    console.error("Failed to load templates for campaign creation:", err);
  }

  if (templates.length === 0) {
    openDrawer(`
      <h2>New campaign</h2>
      <p style="font-size:13px;color:var(--color-text-muted);">
        No active templates exist yet. Create one in Templates before starting a campaign.
      </p>`);
    return;
  }

  const templateOptions = templates.map((t) => `<option value="${t._id}">${escapeHtml(t.name)}</option>`).join("");

  const html = `
    <h2>New campaign</h2>
    <div id="drawer-error" class="auth-error"></div>
    <form id="campaign-form">
      <div class="drawer-field">
        <label for="name">Campaign name</label>
        <input type="text" id="name" required />
      </div>
      <div class="drawer-field">
        <label for="templateId">Template</label>
        <select id="templateId" required>${templateOptions}</select>
      </div>
      <div class="drawer-field">
        <label for="sendingMode">Sending</label>
        <select id="sendingMode">
          <option value="MANUAL">Manual</option>
          <option value="SCHEDULED">Scheduled</option>
        </select>
      </div>
      <div class="drawer-field" id="scheduled-field" style="display:none;">
        <label for="scheduledAt">Scheduled date/time</label>
        <input type="datetime-local" id="scheduledAt" />
      </div>
      <div class="drawer-actions">
        <button type="submit" class="btn btn--primary">Create campaign</button>
      </div>
    </form>`;

  const drawerEl = openDrawer(html);

  const sendingModeSelect = drawerEl.querySelector("#sendingMode");
  const scheduledField = drawerEl.querySelector("#scheduled-field");
  sendingModeSelect.addEventListener("change", () => {
    scheduledField.style.display = sendingModeSelect.value === "SCHEDULED" ? "block" : "none";
  });

  drawerEl.querySelector("#campaign-form").addEventListener("submit", handleCreateCampaign);
}

function showDrawerError(message) {
  const el = document.getElementById("drawer-error");
  if (!el) return;
  el.textContent = message;
  el.classList.add("auth-error--visible");
}

/** Client-side validation only — convex/campaigns.ts re-validates server-side regardless. */
function validateCampaignForm(name, templateId, sendingMode, scheduledAtValue) {
  if (!name.trim()) return "Campaign name is required.";
  if (!templateId) return "A template must be selected.";
  if (sendingMode === "SCHEDULED" && !scheduledAtValue) return "A scheduled date/time is required.";
  return null;
}

async function handleCreateCampaign(event) {
  event.preventDefault();

  const name = document.getElementById("name").value;
  const templateId = document.getElementById("templateId").value;
  const sendingMode = document.getElementById("sendingMode").value;
  const scheduledAtValue = document.getElementById("scheduledAt")?.value;

  const validationError = validateCampaignForm(name, templateId, sendingMode, scheduledAtValue);
  if (validationError) {
    showDrawerError(validationError);
    return;
  }

  try {
    await apiPost("/campaigns/create", {
      name,
      templateId,
      sendingMode,
      scheduledAt: sendingMode === "SCHEDULED" ? new Date(scheduledAtValue).getTime() : undefined,
    });
    closeDrawer();
    await loadCampaigns();
  } catch (err) {
    showDrawerError(err.message);
  }
}

init();