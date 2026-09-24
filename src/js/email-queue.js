/**
 * src/js/email-queue.js
 * Standalone Email Queue page: all campaign-assignment email rows,
 * filterable by campaign/status, with send-one and send-pending.
 * Calls /email-queue/send-one and /email-queue/send-pending — Phase 9
 * replaces the backend stub behind these same routes unchanged.
 */

import "../css/base.css";
import "../css/table.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { confirmDialog } from "./ui/confirmDialog.js";
import { showFeedback } from "./ui/feedback.js";
import { escapeHtml } from "./ui/table.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet, apiPost } from "./lib/api.js";
import { renderUserBadge } from "./ui/topbar.js";

let currentFilters = { campaignId: "", emailStatus: "" };

async function init() {
  const session = await requireSession();
  if (!session) return;

  renderShell(session);
  await populateCampaignFilter();
  await loadQueue();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("email-queue")}
      <main class="main">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1>Email Queue</h1>
            <p>Review and send campaign emails across all campaigns.</p>
          </div>
          <div>${renderUserBadge(session)}</div>
        </div>

        <div id="queue-feedback" class="inline-error"></div>

        <div class="table-toolbar">
          <select id="campaign-filter">
            <option value="">All campaigns</option>
          </select>
          <select id="status-filter">
            <option value="">All statuses</option>
            <option value="NOT_SENT">Not sent</option>
            <option value="QUEUED">Queued</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="BOUNCED">Bounced</option>
            <option value="FAILED">Failed</option>
          </select>
          <div class="spacer"></div>
          <button id="send-pending-btn" class="btn btn--primary">Send pending for selected campaign</button>
        </div>

        <div id="queue-table"></div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);

  document.getElementById("campaign-filter").addEventListener("change", (e) => {
    currentFilters.campaignId = e.target.value;
    loadQueue();
  });
  document.getElementById("status-filter").addEventListener("change", (e) => {
    currentFilters.emailStatus = e.target.value;
    loadQueue();
  });
  document.getElementById("send-pending-btn").addEventListener("click", handleSendPending);
}

async function populateCampaignFilter() {
  try {
    const campaigns = await apiGet("/campaigns/list", {});
    const select = document.getElementById("campaign-filter");
    select.innerHTML =
      `<option value="">All campaigns</option>` +
      campaigns.map((c) => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join("");

    const urlParams = new URLSearchParams(window.location.search);
    const urlCampaignId = urlParams.get("campaignId");
    if (urlCampaignId) {
      select.value = urlCampaignId;
      currentFilters.campaignId = urlCampaignId;
    }
    const urlEmailStatus = urlParams.get("emailStatus");
    if (urlEmailStatus) {
      document.getElementById("status-filter").value = urlEmailStatus;
      currentFilters.emailStatus = urlEmailStatus;
    }
  } catch (err) {
    console.error("Failed to load campaigns for filter:", err);
  }
}

async function loadQueue() {
  const container = document.getElementById("queue-table");
  container.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const params = {
      campaignId: currentFilters.campaignId || undefined,
      emailStatus: currentFilters.emailStatus || undefined,
    };
    const rows = await apiGet("/email-queue/list", params);

    if (rows.length === 0) {
      container.innerHTML = `<div class="table-empty">No matching emails.</div>`;
      return;
    }

    const rowsHtml = rows
      .map(
        (r) => `
        <tr>
          <td><a href="campaign-detail.html?id=${r.campaignId}">${escapeHtml(r.campaignName)}</a></td>
          <td>${escapeHtml(r.participantName)}</td>
          <td>${escapeHtml(r.participantEmail)}</td>
          <td>${escapeHtml(r.templateName)}</td>
          <td><span class="status-pill ${r.emailStatus === "NOT_SENT" ? "status-pill--inactive" : "status-pill--active"}">${r.emailStatus}</span></td>
          <td>${r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</td>
          <td>${r.emailStatus === "NOT_SENT" ? `<button class="btn btn--secondary send-one-btn" data-id="${r._id}" style="padding:4px 10px;font-size:12px;">Send</button>` : ""}</td>
        </tr>`
      )
      .join("");

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>Campaign</th><th>Participant</th><th>Email</th><th>Template</th><th>Status</th><th>Sent at</th><th></th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

    container.querySelectorAll(".send-one-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleSendOne(btn.dataset.id));
    });
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load queue: ${escapeHtml(err.message)}</div>`;
    console.error("Failed to load email queue:", err);
  }
}

async function handleSendOne(assignmentId) {
  const confirmed = await confirmDialog({
    title: "Send this email?",
    message: "This will send the simulated phishing email to this participant.",
    confirmLabel: "Send",
  });
  if (!confirmed) return;

  const feedbackEl = document.getElementById("queue-feedback");
  try {
    await apiPost("/email-queue/send-one", { assignmentId });
    showFeedback(feedbackEl, "Email sent.", "success");
    await loadQueue();
  } catch (err) {
    showFeedback(feedbackEl, err.message, "error");
  }
}

async function handleSendPending() {
  const feedbackEl = document.getElementById("queue-feedback");

  if (!currentFilters.campaignId) {
    showFeedback(feedbackEl, "Select a specific campaign first.", "error");
    return;
  }

  const confirmed = await confirmDialog({
    title: "Send all pending emails?",
    message: "This will send every not-yet-sent email for the selected campaign.",
    confirmLabel: "Send all",
  });
  if (!confirmed) return;

  try {
    const result = await apiPost("/email-queue/send-pending", { campaignId: currentFilters.campaignId });
    showFeedback(
      feedbackEl,
      `${result.sent} sent, ${result.failed} failed, out of ${result.totalPending} pending.`,
      result.failed > 0 ? "error" : "success"
    );
    await loadQueue();
  } catch (err) {
    showFeedback(feedbackEl, err.message, "error");
  }
}

init();