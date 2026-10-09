/**
 * src/js/main.js
 * Overview page: 5 summary cards + recent-activity table with inline
 * column-header filters (campaign, participant, event, date range).
 * Data from convex/dashboard.ts via /dashboard/*. Styling lives in
 * components.css, table.css and pages.css.
 */

import "../css/base.css";
import "../css/table.css";
import "../css/pages.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { renderUserBadge } from "./ui/topbar.js";
import { openDrawer } from "./ui/drawer.js";
import { escapeHtml } from "./ui/table.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet } from "./lib/api.js";

const EVENT_LABELS = { EMAIL_SENT: "Email sent", LINK_CLICKED: "Link clicked" };

const FILTER_KEY_BY_COL = {
  campaign: "campaignId",
  participant: "participantId",
  event: "eventType",
  date: "sinceDays",
};

let activityFilters = { campaignId: "", eventType: "", participantId: "", sinceDays: "" };
let campaignsCache = [];
let participantsCache = [];
let lastActivityRows = [];
let openPopoverCol = null;

async function init() {
  const session = await requireSession();
  if (!session) return;

  renderShell(session);
  await Promise.all([loadSummary(), loadFilterOptions()]);
  await loadActivity();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("overview")}
      <main class="main">
        <div class="page-header">
          <div>
            <h1>Overview</h1>
            <p>What's happening with your simulations right now.</p>
          </div>
          <div>${renderUserBadge(session)}</div>
        </div>

        <div id="summary-cards" class="stat-grid stat-grid--5">
          <div class="table-empty">Loading…</div>
        </div>

        <div class="panel panel--flush">
          <div class="panel__header">Recent activity</div>
          <div id="activity-table" class="activity-table"></div>
        </div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Event delegation on the persistent container survives innerHTML swaps.
  document.getElementById("activity-table").addEventListener("click", handleTableClick);
  document.addEventListener("click", handleOutsideClick);
}

async function loadFilterOptions() {
  try {
    const [campaigns, participants] = await Promise.all([
      apiGet("/campaigns/list", {}),
      apiGet("/participants/list", {}),
    ]);
    campaignsCache = campaigns;
    participantsCache = participants;
  } catch (err) {
    console.error("Failed to load filter options:", err);
  }
}

function statCard({ label, value, href }) {
  const inner = `
    <div class="stat-card__label">${label}</div>
    <div class="stat-card__value">${value}</div>`;

  if (href) {
    return `<a href="${href}" class="panel stat-card stat-card--link">${inner}</a>`;
  }
  return `<div class="panel stat-card">${inner}</div>`;
}

async function loadSummary() {
  const container = document.getElementById("summary-cards");
  try {
    const s = await apiGet("/dashboard/summary", {});
    container.innerHTML = [
      statCard({ label: "Participants", value: s.totalParticipants, href: "participants.html" }),
      statCard({ label: "Active campaigns", value: s.activeCampaigns, href: "campaigns.html?status=ACTIVE" }),
      statCard({ label: "Emails sent", value: s.emailsSent, href: "email-queue.html?emailStatus=SENT" }),
      statCard({ label: "Pending", value: s.emailsPending, href: "email-queue.html?emailStatus=NOT_SENT" }),
      statCard({ label: "Click rate", value: `${s.clickRate}% (${s.linkClicks})` }),
    ].join("");
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load summary: ${escapeHtml(err.message)}</div>`;
    console.error("Failed to load dashboard summary:", err);
  }
}

function getColumnOptions(col) {
  if (col === "campaign") {
    return [{ value: "", label: "All campaigns" }, ...campaignsCache.map((c) => ({ value: c._id, label: c.name }))];
  }
  if (col === "participant") {
    return [
      { value: "", label: "All participants" },
      ...participantsCache.map((p) => ({ value: p._id, label: `${p.firstName} ${p.surname}` })),
    ];
  }
  if (col === "event") {
    return [
      { value: "", label: "All events" },
      { value: "EMAIL_SENT", label: "Email sent" },
      { value: "LINK_CLICKED", label: "Link clicked" },
    ];
  }
  if (col === "date") {
    return [
      { value: "", label: "All time" },
      { value: "7", label: "Last 7 days" },
      { value: "14", label: "Last 14 days" },
      { value: "30", label: "Last 30 days" },
    ];
  }
  return [];
}

function renderFilterableHeader(col, label) {
  const filterKey = FILTER_KEY_BY_COL[col];
  const isActive = Boolean(activityFilters[filterKey]);
  const isOpen = openPopoverCol === col;

  const optionsHtml = getColumnOptions(col)
    .map((opt) => {
      const selected = (activityFilters[filterKey] || "") === opt.value;
      return `<button type="button" class="th-popover-option${selected ? " is-selected" : ""}" data-col="${col}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>`;
    })
    .join("");

  return `
    <th class="th-filterable">
      <span class="th-label" data-col="${col}">
        ${label}
        <span class="th-label__chevron${isActive ? " is-active" : ""}">&#9662;</span>
      </span>
      <div class="th-popover${isOpen ? " is-open" : ""}" data-popover="${col}">
        ${optionsHtml}
      </div>
    </th>`;
}

/** Draws the table from already-fetched rows: no network call. */
function renderActivityTable(rows) {
  const container = document.getElementById("activity-table");

  const rowsHtml = rows.length
    ? rows
        .map(
          (r) => `
      <tr>
        <td>${escapeHtml(r.campaignName)}</td>
        <td>${escapeHtml(r.participantName)}</td>
        <td>${escapeHtml(r.department)}</td>
        <td><span class="status-pill ${r.eventType === "LINK_CLICKED" ? "status-pill--inactive" : "status-pill--active"}">${EVENT_LABELS[r.eventType] || r.eventType}</span></td>
        <td>${new Date(r.occurredAt).toLocaleDateString()}</td>
        <td><button class="btn btn--secondary btn--sm view-btn" data-event-id="${r.eventId}">View</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6"><div class="empty-state"><div class="empty-state__icon">&#128203;</div><div class="empty-state__title">No activity yet</div><div>Sent emails and link clicks will appear here.</div></div></td></tr>`;

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          ${renderFilterableHeader("campaign", "Campaign")}
          ${renderFilterableHeader("participant", "Participant")}
          <th>Department</th>
          ${renderFilterableHeader("event", "Event")}
          ${renderFilterableHeader("date", "Date")}
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  container.querySelectorAll(".view-btn").forEach((btn) => {
    const row = rows.find((r) => r.eventId === btn.dataset.eventId);
    btn.addEventListener("click", () => openActivityDrawer(row));
  });
}

/** Fetches from the server: only called when a filter value actually changes. */
async function loadActivity() {
  const container = document.getElementById("activity-table");
  container.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const rows = await apiGet("/dashboard/recent-activity", {
      campaignId: activityFilters.campaignId || undefined,
      eventType: activityFilters.eventType || undefined,
      participantId: activityFilters.participantId || undefined,
      sinceDays: activityFilters.sinceDays || undefined,
    });
    lastActivityRows = rows;
    renderActivityTable(rows);
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load activity: ${escapeHtml(err.message)}</div>`;
    console.error("Failed to load recent activity:", err);
  }
}

function handleTableClick(e) {
  const label = e.target.closest(".th-label");
  if (label) {
    e.stopPropagation();
    const col = label.dataset.col;
    openPopoverCol = openPopoverCol === col ? null : col;
    renderActivityTable(lastActivityRows); // toggle only, no fetch
    return;
  }

  const option = e.target.closest(".th-popover-option");
  if (option) {
    e.stopPropagation();
    activityFilters[FILTER_KEY_BY_COL[option.dataset.col]] = option.dataset.value;
    openPopoverCol = null;
    loadActivity(); // a real filter changed
  }
}

function handleOutsideClick(e) {
  if (!openPopoverCol) return;
  if (e.target.closest(".th-popover") || e.target.closest(".th-label")) return;
  openPopoverCol = null;
  renderActivityTable(lastActivityRows);
}

function openActivityDrawer(row) {
  openDrawer(`
    <h2>${EVENT_LABELS[row.eventType] || row.eventType}</h2>
    <div class="drawer-field"><label>Campaign</label><div>${escapeHtml(row.campaignName)}</div></div>
    <div class="drawer-field"><label>Participant</label><div>${escapeHtml(row.participantName)}</div></div>
    <div class="drawer-field"><label>Department</label><div>${escapeHtml(row.department)}</div></div>
    <div class="drawer-field"><label>Date/time</label><div>${new Date(row.occurredAt).toLocaleString()}</div></div>
    <div class="drawer-actions">
      <a href="campaign-detail.html?id=${row.campaignId}" class="btn btn--primary">View campaign</a>
    </div>`);
}

init();