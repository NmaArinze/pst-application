/**
 * src/js/reports.js
 * Reports page: global time filter, summary cards, click-rate-by-campaign
 * chart, sortable Campaign / Department / Template tables, CSV export.
 * Data from convex/reports.ts via /reports. Styling lives in
 * components.css, table.css and pages.css.
 */

import "../css/base.css";
import "../css/table.css";
import "../css/pages.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { renderUserBadge } from "./ui/topbar.js";
import { escapeHtml } from "./ui/table.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet } from "./lib/api.js";

let currentRange = "30d";
let customStart = "";
let customEnd = "";
let reportData = null;
let reportsRequestId = 0;

const sortState = {
  campaign: { col: "clickRate", dir: "desc" },
  department: null,
  template: { col: "clickRate", dir: "desc" },
};

async function init() {
  const session = await requireSession();
  if (!session) return;

  renderShell(session);
  await loadReports();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("reports")}
      <main class="main">
        <div class="page-header">
          <div>
            <h1>Reports</h1>
            <p>Campaign, department, and template performance over time.</p>
          </div>
          <div>${renderUserBadge(session)}</div>
        </div>

        <div id="summary-cards" class="stat-grid stat-grid--4"></div>

        <div class="table-toolbar">
          <select id="range-select">
            <option value="7d">Last 7 days</option>
            <option value="30d" selected>Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="custom">Custom range</option>
          </select>
          <input type="date" id="custom-start" class="is-hidden" />
          <input type="date" id="custom-end" class="is-hidden" />
          <div class="spacer"></div>
          <button id="export-csv-btn" class="btn btn--primary" disabled>Export CSV</button>
        </div>

        <div id="reports-body"><div class="table-empty">Loading…</div></div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);

  const rangeSelect = document.getElementById("range-select");
  const startInput = document.getElementById("custom-start");
  const endInput = document.getElementById("custom-end");

  rangeSelect.addEventListener("change", (event) => {
    currentRange = event.target.value;
    const isCustom = currentRange === "custom";

    startInput.classList.toggle("is-hidden", !isCustom);
    endInput.classList.toggle("is-hidden", !isCustom);

    if (!isCustom) {
      loadReports();
    } else {
      reportData = null;
      setExportState(true);
    }
  });

  startInput.addEventListener("change", (event) => {
    customStart = event.target.value;
    endInput.min = customStart || "";
    if (isValidCustomRange()) loadReports();
  });

  endInput.addEventListener("change", (event) => {
    customEnd = event.target.value;
    if (isValidCustomRange()) loadReports();
  });

  document.getElementById("export-csv-btn").addEventListener("click", handleExportCsv);
}

function isValidCustomRange() {
  return Boolean(customStart && customEnd && customStart <= customEnd);
}

function setExportState(disabled) {
  const button = document.getElementById("export-csv-btn");
  if (button) button.disabled = disabled;
}

async function loadReports() {
  const container = document.getElementById("reports-body");
  const summaryContainer = document.getElementById("summary-cards");
  if (!container || !summaryContainer) return;

  const requestId = ++reportsRequestId;

  container.innerHTML = `<div class="table-empty">Loading…</div>`;
  summaryContainer.innerHTML = `<div class="table-empty">Loading…</div>`;
  setExportState(true);

  try {
    const params = { range: currentRange };

    if (currentRange === "custom") {
      if (!isValidCustomRange()) {
        container.innerHTML = `<div class="table-empty">Select a valid start and end date.</div>`;
        summaryContainer.innerHTML = "";
        return;
      }
      params.start = new Date(`${customStart}T00:00:00`).getTime();
      params.end = new Date(`${customEnd}T23:59:59.999`).getTime();
    }

    const data = await apiGet("/reports", params);

    // Ignore a stale response if the range changed while this was in flight.
    if (requestId !== reportsRequestId) return;

    reportData = data;
    renderSummaryCards();
    renderReportsBody();
    setExportState(false);
  } catch (error) {
    if (requestId !== reportsRequestId) return;

    reportData = null;
    container.innerHTML = `<div class="table-empty">Could not load reports: ${escapeHtml(String(error.message ?? "Unknown error"))}</div>`;
    summaryContainer.innerHTML = "";
    setExportState(true);
    console.error("Failed to load reports:", error);
  }
}

function statCard(label, value) {
  return `
    <div class="panel stat-card stat-card--lg">
      <div class="stat-card__label">${escapeHtml(String(label))}</div>
      <div class="stat-card__value">${escapeHtml(String(value))}</div>
    </div>`;
}


function renderSummaryCards() {
  const summaryContainer =
    document.getElementById("summary-cards");

  if (!summaryContainer || !reportData?.summary) {
    return;
  }

  const {
    passRate = 100,
    totalEmailsSent = 0,
    activeCampaignsInRange = 0,
    participantsTested = 0,
  } = reportData.summary;

  summaryContainer.innerHTML = [
    statCard("Pass Rate", `${passRate}%`),
    statCard("Emails sent", totalEmailsSent),
    statCard("Active campaigns", activeCampaignsInRange),
    statCard("Participants tested", participantsTested),
  ].join("");
}

function escapeCsvValue(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildCsv() {
  if (!reportData) return "";

  const {
    campaignPerformance = [],
    departmentPerformance = [],
    templatePerformance = [],
  } = reportData;

  const lines = [];

  lines.push("Campaign Performance");
  lines.push("Campaign Name,Emails Sent,Click Count,Click Rate,Status");
  campaignPerformance.forEach((r) =>
    lines.push([r.campaignName, r.emailsSent, r.clickCount, `${r.clickRate}%`, r.status].map(escapeCsvValue).join(","))
  );
  lines.push("");

  lines.push("Department Performance");
  lines.push("Department,Participants Tested,Emails Sent,Click Count,Click Rate");
  departmentPerformance.forEach((r) =>
    lines.push([r.department, r.participantsTested, r.emailsSent, r.clickCount, `${r.clickRate}%`].map(escapeCsvValue).join(","))
  );
  lines.push("");

  lines.push("Template Performance");
  lines.push("Template Name,Campaigns Used,Emails Sent,Click Count,Click Rate");
  templatePerformance.forEach((r) =>
    lines.push([r.templateName, r.timesUsed, r.emailsSent, r.clickCount, `${r.clickRate}%`].map(escapeCsvValue).join(","))
  );

  return lines.join("\n");
}

function handleExportCsv() {
  if (!reportData) return;

  const csv = buildCsv();
  if (!csv) return;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `pst-reports-${currentRange}-${new Date().toISOString().slice(0, 10)}.csv`;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function sortRows(rows, col, dir) {
  return [...rows].sort((a, b) => {
    const av = a?.[col];
    const bv = b?.[col];

    const aNumber = Number(av);
    const bNumber = Number(bv);
    const bothNumeric =
      av !== null && av !== undefined && av !== "" &&
      bv !== null && bv !== undefined && bv !== "" &&
      Number.isFinite(aNumber) && Number.isFinite(bNumber);

    if (bothNumeric) {
      return dir === "asc" ? aNumber - bNumber : bNumber - aNumber;
    }

    const aString = String(av ?? "");
    const bString = String(bv ?? "");
    return dir === "asc" ? aString.localeCompare(bString) : bString.localeCompare(aString);
  });
}

function sortableHeader(section, col, label) {
  const state = sortState[section];
  const isActive = state && state.col === col;
  const arrow = isActive ? (state.dir === "asc" ? " &#9650;" : " &#9660;") : "";

  return `<th class="th-sortable" data-section="${escapeHtml(section)}" data-col="${escapeHtml(col)}">${escapeHtml(label)}${arrow}</th>`;
}

function renderReportsBody() {
  const container = document.getElementById("reports-body");
  if (!container || !reportData) return;

  const {
    campaignPerformance = [],
    departmentPerformance = [],
    templatePerformance = [],
    trend = [],
  } = reportData;

  const sortedCampaigns = sortState.campaign
    ? sortRows(campaignPerformance, sortState.campaign.col, sortState.campaign.dir)
    : campaignPerformance;
  const sortedDepartments = sortState.department
    ? sortRows(departmentPerformance, sortState.department.col, sortState.department.dir)
    : departmentPerformance;
  const sortedTemplates = sortState.template
    ? sortRows(templatePerformance, sortState.template.col, sortState.template.dir)
    : templatePerformance;

  container.innerHTML = `
    <div class="panel panel--spaced">
      <div class="panel__title">Click rate by campaign</div>
      ${renderTrendChart(trend)}
    </div>

    <div class="panel panel--flush panel--spaced">
      <div class="panel__header">Campaign performance</div>
      ${renderTable(sortedCampaigns, "campaign", [
        ["campaignName", "Campaign Name"],
        ["emailsSent", "Emails Sent"],
        ["clickCount", "Click Count"],
        ["clickRate", "Click Rate"],
        ["status", "Status"],
      ])}
    </div>

    <div class="panel panel--flush panel--spaced">
      <div class="panel__header">Department performance</div>
      ${renderTable(sortedDepartments, "department", [
        ["department", "Department"],
        ["participantsTested", "Participants Tested"],
        ["emailsSent", "Emails Sent"],
        ["clickCount", "Click Count"],
        ["clickRate", "Click Rate"],
      ])}
    </div>

    <div class="panel panel--flush">
      <div class="panel__header">Template performance</div>
      ${renderTable(sortedTemplates, "template", [
        ["templateName", "Template Name"],
        ["timesUsed", "Campaigns Used"],
        ["emailsSent", "Emails Sent"],
        ["clickCount", "Click Count"],
        ["clickRate", "Click Rate"],
      ])}
    </div>`;

  container.querySelectorAll("th[data-section]").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.dataset.section;
      const col = header.dataset.col;
      const current = sortState[section];
      const dir = current && current.col === col && current.dir === "desc" ? "asc" : "desc";
      sortState[section] = { col, dir };
      renderReportsBody();
    });
  });
}

function renderTable(rows, section, columns) {
  if (!rows || rows.length === 0) {
    return `<div class="table-empty">No data for this time range.</div>`;
  }

  const headerHtml = columns.map(([col, label]) => sortableHeader(section, col, label)).join("");

  const rowsHtml = rows
    .map((row) => {
      const cells = columns
        .map(([col]) => {
          const value = row?.[col];
          const display =
            col === "clickRate"
              ? `${escapeHtml(String(value ?? 0))}%`
              : escapeHtml(String(value ?? ""));
          return `<td>${display}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="data-table">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

/**
 * Native SVG chart: one point per campaign, ordered by launch/creation
 * date. Only geometry is set here; all presentation is in pages.css.
 */
function renderTrendChart(trend) {
  if (!trend || trend.length === 0) {
    return `<div class="table-empty">No campaign data for this time range.</div>`;
  }

  const width = 720;
  const height = 220;
  const padding = 36;
  const maxRate = 100;

  const points = trend.map((item, index) => {
    const x =
      trend.length === 1
        ? width / 2
        : padding + (index / (trend.length - 1)) * (width - padding * 2);

    const clickRate = Math.min(Math.max(Number(item.clickRate) || 0, 0), maxRate);
    const y = height - padding - (clickRate / maxRate) * (height - padding * 2);

    return { x, y, ...item, clickRate };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const dotsHtml = points
    .map(
      (p) => `<circle class="chart-dot" cx="${p.x}" cy="${p.y}" r="4"><title>${escapeHtml(String(p.campaignName ?? ""))}: ${p.clickRate}%</title></circle>`
    )
    .join("");

  const labelsHtml = points
    .map( 
      (p) => `<text class="chart-label chart-label--middle" x="${p.x}" y="${height - 8}">${escapeHtml(String(p.campaignName ?? "").slice(0, 10))}</text>`
    )
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Click rate by campaign">
      <line class="chart-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" />
      <line class="chart-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
      <text class="chart-label chart-label--end" x="${padding - 8}" y="${padding}">100%</text>
      <text class="chart-label chart-label--end" x="${padding - 8}" y="${height - padding}">0%</text>
      <path class="chart-line" d="${pathD}" />
      ${dotsHtml}
      ${labelsHtml}
    </svg>`;
}

init();