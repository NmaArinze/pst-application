/**
 * src/js/main.js
 * Overview / Dashboard page: 5 clickable summary cards + a recent
 * activity table with inline column-header filters (Campaign,
 * Participant, Event, Date range) — click a header to open its filter
 * dropdown, no separate toolbar. Computed live from convex/dashboard.ts.
 */

import "../css/base.css";
import "../css/table.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { openDrawer } from "./ui/drawer.js";
import { escapeHtml } from "./ui/table.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet } from "./lib/api.js";

const EVENT_LABELS = { EMAIL_SENT: "Email sent", LINK_CLICKED: "Link clicked" };

let activityFilters = { campaignId: "", eventType: "", participantId: "", sinceDays: "" };
let campaignsCache = [];
let participantsCache = [];
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
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1>Overview</h1>
            <p>What's happening with your simulations right now.</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:500;color:var(--color-text);">${escapeHtml(session.name)}</div>
            <button id="logout-btn" class="btn btn--secondary" style="margin-top:6px;padding:5px 12px;font-size:12px;">
              Log out
            </button>
          </div>
        </div>

        <div id="summary-cards" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;">
          <div class="table-empty">Loading…</div>
        </div>

        <div class="panel" style="padding:0;">
          <div style="padding:14px 18px;border-bottom:1px solid var(--color-border);">
            <div style="font-size:14px;font-weight:600;">Recent activity</div>
          </div>
          <div id="activity-table" style="position:relative;"></div>
        </div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Event delegation on the persistent container — safe across
  // repeated innerHTML swaps inside loadActivity().
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
    <div style="font-size:12px;color:var(--color-text-faint);margin-bottom:6px;">${label}</div>
    <div style="font-size:24px;font-weight:600;font-family:var(--font-mono);">${value}</div>`;
  if (href) {
    return `<a href="${href}" class="panel" style="display:block;text-decoration:none;color:inherit;">${inner}</a>`;
  }
  return `<div class="panel">${inner}</div>`;
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

/** Column filter definitions: which columns get a header dropdown, and their options. */
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

const FILTER_KEY_BY_COL = {
  campaign: "campaignId",
  participant: "participantId",
  event: "eventType",
  date: "sinceDays",
};

function renderFilterableHeader(col, label) {
  const filterKey = FILTER_KEY_BY_COL[col];
  const isActive = Boolean(activityFilters[filterKey]);
  const isOpen = openPopoverCol === col;

  const options = getColumnOptions(col);
  const optionsHtml = options
    .map((opt) => {
      const selected = (activityFilters[filterKey] || "") === opt.value;
      return `<button type="button" class="th-popover-option" data-col="${col}" data-value="${escapeHtml(opt.value)}"
        style="display:block;width:100%;text-align:left;padding:7px 10px;border:none;background:${selected ? "var(--color-accent-soft)" : "transparent"};color:${selected ? "var(--color-accent)" : "var(--color-text)"};font-size:12.5px;cursor:pointer;border-radius:4px;">
        ${escapeHtml(opt.label)}
      </button>`;
    })
    .join("");

  return `
    <th style="position:relative;">
      <span class="th-label" data-col="${col}" style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;">
        ${label}
        <span style="font-size:9px;color:${isActive ? "var(--color-accent)" : "var(--color-text-faint)"};">&#9662;</span>
      </span>
      <div class="th-popover" data-popover="${col}"
        style="display:${isOpen ? "block" : "none"};position:absolute;top:100%;left:0;z-index:50;background:#fff;border:1px solid var(--color-border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:190px;max-height:260px;overflow-y:auto;padding:4px;margin-top:4px;">
        ${optionsHtml}
      </div>
    </th>`;
}

let lastActivityRows = [];

/** Builds and inserts the table HTML from already-fetched rows — no network call. Used both after a real fetch and when just toggling a popover open/closed. */
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
        <td><button class="btn btn--secondary view-btn" data-event-id="${r.eventId}" style="padding:4px 10px;font-size:12px;">View</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--color-text-faint);padding:24px;">No matching activity.</td></tr>`;

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

/** Actually fetches from the server — only called when a filter value truly changes. */
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
    renderActivityTable(lastActivityRows); // just toggling — no fetch
    return;
  }

  const option = e.target.closest(".th-popover-option");
  if (option) {
    e.stopPropagation();
    const col = option.dataset.col;
    const filterKey = FILTER_KEY_BY_COL[col];
    activityFilters[filterKey] = option.dataset.value;
    openPopoverCol = null;
    loadActivity(); // a real filter changed — fetch new data
  }
}

function handleOutsideClick(e) {
  if (!openPopoverCol) return;
  if (e.target.closest(".th-popover") || e.target.closest(".th-label")) return;
  openPopoverCol = null;
  renderActivityTable(lastActivityRows); // just closing — no fetch
}

function openActivityDrawer(row) {
  openDrawer(`
    <h2>${EVENT_LABELS[row.eventType] || row.eventType}</h2>
    <div class="drawer-field"><label>Campaign</label><div>${escapeHtml(row.campaignName)}</div></div>
    <div class="drawer-field"><label>Participant</label><div>${escapeHtml(row.participantName)}</div></div>
    <div class="drawer-field"><label>Department</label><div>${escapeHtml(row.department)}</div></div>
    <div class="drawer-field"><label>Date/time</label><div>${new Date(row.occurredAt).toLocaleString()}</div></div>
    <div class="drawer-actions">
      <a href="campaign-detail.html?id=${row.campaignId}" class="btn btn--primary" style="text-decoration:none;">View campaign</a>
    </div>`);
}

init();