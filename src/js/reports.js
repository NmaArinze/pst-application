/**
 * src/js/reports.js
 *
 * Reports page:
 * - Global time filter
 * - Summary cards
 * - Sortable Campaign, Department, and Template tables
 * - Click Rate by Campaign SVG chart
 * - CSV export
 *
 * All report data comes from convex/reports.ts via /reports.
 */

import "../css/base.css";
import "../css/table.css";

import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { escapeHtml } from "./ui/table.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet } from "./lib/api.js";
import { renderUserBadge } from "./ui/topbar.js";

let currentRange = "30d";
let customStart = "";
let customEnd = "";

let reportData = null;
let reportsRequestId = 0;

let sortState = {
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

        <div
          class="page-header"
          style="display:flex;justify-content:space-between;align-items:flex-start;"
        >
          <div>
            <h1>Reports</h1>
            <p>Campaign, department, and template performance over time.</p>
          </div>
          <div>${renderUserBadge(session)}</div>
        </div>

        <div
          id="summary-cards"
          style="
            display:grid;
            grid-template-columns:repeat(4,1fr);
            gap:12px;
            margin-bottom:20px;
          "
        ></div>

        <div class="table-toolbar">

          <select id="range-select">
            <option value="7d">Last 7 days</option>
            <option value="30d" selected>Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="custom">Custom range</option>
          </select>

          <input
            type="date"
            id="custom-start"
            style="
              display:none;
              padding:8px 12px;
              border:1px solid var(--color-border);
              border-radius:var(--radius-md);
              font-size:13px;
            "
          />

          <input
            type="date"
            id="custom-end"
            style="
              display:none;
              padding:8px 12px;
              border:1px solid var(--color-border);
              border-radius:var(--radius-md);
              font-size:13px;
            "
          />

          <div class="spacer"></div>

          <button
            id="export-csv-btn"
            class="btn btn--primary"
            disabled
          >
            Export CSV
          </button>

        </div>

        <div id="reports-body">
          <div class="table-empty">Loading…</div>
        </div>

      </main>
    </div>
  `;

  bindSidebarNav(app);

  document
    .getElementById("logout-btn")
    .addEventListener("click", logout);

  const rangeSelect = document.getElementById("range-select");
  const startInput = document.getElementById("custom-start");
  const endInput = document.getElementById("custom-end");

  rangeSelect.addEventListener("change", (event) => {
    currentRange = event.target.value;

    const isCustom = currentRange === "custom";

    startInput.style.display = isCustom
      ? "inline-block"
      : "none";

    endInput.style.display = isCustom
      ? "inline-block"
      : "none";

    if (!isCustom) {
      loadReports();
    } else {
      reportData = null;
      setExportState(false);
    }
  });

  startInput.addEventListener("change", (event) => {
    customStart = event.target.value;

    endInput.min = customStart || "";

    if (isValidCustomRange()) {
      loadReports();
    }
  });

  endInput.addEventListener("change", (event) => {
    customEnd = event.target.value;

    if (isValidCustomRange()) {
      loadReports();
    }
  });

  document
    .getElementById("export-csv-btn")
    .addEventListener("click", handleExportCsv);
}

function isValidCustomRange() {
  if (!customStart || !customEnd) {
    return false;
  }

  return customStart <= customEnd;
}

function setExportState(disabled) {
  const button = document.getElementById("export-csv-btn");

  if (button) {
    button.disabled = disabled;
  }
}

async function loadReports() {
  const container = document.getElementById("reports-body");
  const summaryContainer = document.getElementById("summary-cards");

  if (!container || !summaryContainer) {
    return;
  }

  const requestId = ++reportsRequestId;

  container.innerHTML = `
    <div class="table-empty">Loading…</div>
  `;

  summaryContainer.innerHTML = `
    <div class="table-empty">Loading…</div>
  `;

  setExportState(true);

  try {
    const params = {
      range: currentRange,
    };

    if (currentRange === "custom") {
      if (!isValidCustomRange()) {
        container.innerHTML = `
          <div class="table-empty">
            Select a valid start and end date.
          </div>
        `;

        summaryContainer.innerHTML = "";

        setExportState(true);

        return;
      }

      params.start = new Date(
        `${customStart}T00:00:00`
      ).getTime();

      params.end = new Date(
        `${customEnd}T23:59:59.999`
      ).getTime();
    }

    const data = await apiGet("/reports", params);

    if (requestId !== reportsRequestId) {
      return;
    }

    reportData = data;

    renderSummaryCards();
    renderReportsBody();

    setExportState(false);
  } catch (error) {
    if (requestId !== reportsRequestId) {
      return;
    }

    reportData = null;

    container.innerHTML = `
      <div class="table-empty">
        Could not load reports:
        ${escapeHtml(String(error.message ?? "Unknown error"))}
      </div>
    `;

    summaryContainer.innerHTML = "";

    setExportState(true);

    console.error("Failed to load reports:", error);
  }
}

function statCard(label, value) {
  return `
    <div class="panel">
      <div
        style="
          font-size:12px;
          color:var(--color-text-faint);
          margin-bottom:6px;
        "
      >
        ${escapeHtml(String(label))}
      </div>

      <div
        style="
          font-size:24px;
          font-weight:600;
          font-family:var(--font-mono);
        "
      >
        ${escapeHtml(String(value))}
      </div>
    </div>
  `;
}

function renderSummaryCards() {
  const summaryContainer =
    document.getElementById("summary-cards");

  if (!summaryContainer || !reportData?.summary) {
    return;
  }

  const {
    totalEmailsSent = 0,
    overallClickRate = 0,
    activeCampaignsInRange = 0,
    participantsTested = 0,
  } = reportData.summary;

  summaryContainer.innerHTML = [
    statCard("Emails sent", totalEmailsSent),
    statCard(
      "Overall click rate",
      `${overallClickRate}%`
    ),
    statCard(
      "Active campaigns",
      activeCampaignsInRange
    ),
    statCard(
      "Participants tested",
      participantsTested
    ),
  ].join("");
}

function escapeCsvValue(value) {
  const str = String(value ?? "");

  return /[",\n]/.test(str)
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function buildCsv() {
  if (!reportData) {
    return "";
  }

  const {
    campaignPerformance = [],
    departmentPerformance = [],
    templatePerformance = [],
  } = reportData;

  const lines = [];

  lines.push("Campaign Performance");
  lines.push(
    "Campaign Name,Emails Sent,Click Count,Click Rate,Status"
  );

  campaignPerformance.forEach((row) => {
    lines.push(
      [
        row.campaignName,
        row.emailsSent,
        row.clickCount,
        `${row.clickRate}%`,
        row.status,
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  });

  lines.push("");

  lines.push("Department Performance");
  lines.push(
    "Department,Participants Tested,Emails Sent,Click Count,Click Rate"
  );

  departmentPerformance.forEach((row) => {
    lines.push(
      [
        row.department,
        row.participantsTested,
        row.emailsSent,
        row.clickCount,
        `${row.clickRate}%`,
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  });

  lines.push("");

  lines.push("Template Performance");
  lines.push(
    "Template Name,Campaigns Used,Emails Sent,Click Count,Click Rate"
  );

  templatePerformance.forEach((row) => {
    lines.push(
      [
        row.templateName,
        row.timesUsed,
        row.emailsSent,
        row.clickCount,
        `${row.clickRate}%`,
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  });

  return lines.join("\n");
}

function handleExportCsv() {
  if (!reportData) {
    return;
  }

  const csv = buildCsv();

  if (!csv) {
    return;
  }

  const blob = new Blob(
    [csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;

  anchor.download =
    `pst-reports-${currentRange}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

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
      av !== null &&
      av !== undefined &&
      bv !== null &&
      bv !== undefined &&
      av !== "" &&
      bv !== "" &&
      Number.isFinite(aNumber) &&
      Number.isFinite(bNumber);

    if (bothNumeric) {
      return dir === "asc"
        ? aNumber - bNumber
        : bNumber - aNumber;
    }

    const aString = String(av ?? "");
    const bString = String(bv ?? "");

    return dir === "asc"
      ? aString.localeCompare(bString)
      : bString.localeCompare(aString);
  });
}

function sortableHeader(section, col, label) {
  const state = sortState[section];

  const isActive =
    state &&
    state.col === col;

  const arrow = isActive
    ? state.dir === "asc"
      ? " &#9650;"
      : " &#9660;"
    : "";

  return `
    <th
      data-section="${escapeHtml(section)}"
      data-col="${escapeHtml(col)}"
      style="cursor:pointer;user-select:none;"
    >
      ${escapeHtml(label)}${arrow}
    </th>
  `;
}

function renderReportsBody() {
  const container =
    document.getElementById("reports-body");

  if (!container || !reportData) {
    return;
  }

  const {
    campaignPerformance = [],
    departmentPerformance = [],
    templatePerformance = [],
    trend = [],
  } = reportData;

  const sortedCampaigns = sortState.campaign
    ? sortRows(
        campaignPerformance,
        sortState.campaign.col,
        sortState.campaign.dir
      )
    : campaignPerformance;

  const sortedDepartments = sortState.department
    ? sortRows(
        departmentPerformance,
        sortState.department.col,
        sortState.department.dir
      )
    : departmentPerformance;

  const sortedTemplates = sortState.template
    ? sortRows(
        templatePerformance,
        sortState.template.col,
        sortState.template.dir
      )
    : templatePerformance;

  container.innerHTML = `
    <div
      class="panel"
      style="margin-bottom:16px;"
    >
      <div
        style="
          font-size:14px;
          font-weight:600;
          margin-bottom:12px;
        "
      >
        Click rate by campaign
      </div>

      ${renderTrendChart(trend)}
    </div>

    <div
      class="panel"
      style="padding:0;margin-bottom:16px;"
    >
      <div
        style="
          padding:14px 18px;
          border-bottom:1px solid var(--color-border);
          font-size:14px;
          font-weight:600;
        "
      >
        Campaign performance
      </div>

      ${renderTable(
        sortedCampaigns,
        "campaign",
        [
          ["campaignName", "Campaign Name"],
          ["emailsSent", "Emails Sent"],
          ["clickCount", "Click Count"],
          ["clickRate", "Click Rate"],
          ["status", "Status"],
        ]
      )}
    </div>

    <div
      class="panel"
      style="padding:0;margin-bottom:16px;"
    >
      <div
        style="
          padding:14px 18px;
          border-bottom:1px solid var(--color-border);
          font-size:14px;
          font-weight:600;
        "
      >
        Department performance
      </div>

      ${renderTable(
        sortedDepartments,
        "department",
        [
          ["department", "Department"],
          ["participantsTested", "Participants Tested"],
          ["emailsSent", "Emails Sent"],
          ["clickCount", "Click Count"],
          ["clickRate", "Click Rate"],
        ]
      )}
    </div>

    <div
      class="panel"
      style="padding:0;"
    >
      <div
        style="
          padding:14px 18px;
          border-bottom:1px solid var(--color-border);
          font-size:14px;
          font-weight:600;
        "
      >
        Template performance
      </div>

      ${renderTable(
        sortedTemplates,
        "template",
        [
          ["templateName", "Template Name"],
          ["timesUsed", "Campaigns Used"],
          ["emailsSent", "Emails Sent"],
          ["clickCount", "Click Count"],
          ["clickRate", "Click Rate"],
        ]
      )}
    </div>
  `;

  container
    .querySelectorAll("th[data-section]")
    .forEach((header) => {
      header.addEventListener("click", () => {
        const section = header.dataset.section;
        const col = header.dataset.col;

        const current = sortState[section];

        const dir =
          current &&
          current.col === col &&
          current.dir === "desc"
            ? "asc"
            : "desc";

        sortState[section] = {
          col,
          dir,
        };

        renderReportsBody();
      });
    });
}

function renderTable(rows, section, columns) {
  if (!rows || rows.length === 0) {
    return `
      <div class="table-empty">
        No data for this time range.
      </div>
    `;
  }

  const headerHtml = columns
    .map(([col, label]) =>
      sortableHeader(section, col, label)
    )
    .join("");

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
      <thead>
        <tr>
          ${headerHtml}
        </tr>
      </thead>

      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

/**
 * Native SVG chart.
 *
 * The backend currently provides one point per campaign,
 * ordered by campaign launch/creation date.
 */
function renderTrendChart(trend) {
  if (!trend || trend.length === 0) {
    return `
      <div class="table-empty">
        No campaign data for this time range.
      </div>
    `;
  }

  const width = 720;
  const height = 220;
  const padding = 36;
  const maxRate = 100;

  const points = trend.map((item, index) => {
    const x =
      trend.length === 1
        ? width / 2
        : padding +
          (index / (trend.length - 1)) *
            (width - padding * 2);

    const clickRate = Math.min(
      Math.max(Number(item.clickRate) || 0, 0),
      maxRate
    );

    const y =
      height -
      padding -
      (clickRate / maxRate) *
        (height - padding * 2);

    return {
      x,
      y,
      ...item,
      clickRate,
    };
  });

  const pathD = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");

  const dotsHtml = points
    .map(
      (point) => `
        <circle
          cx="${point.x}"
          cy="${point.y}"
          r="4"
          fill="var(--color-accent)"
        >
          <title>
            ${escapeHtml(
              String(point.campaignName ?? "")
            )}: ${point.clickRate}%
          </title>
        </circle>
      `
    )
    .join("");

  const labelsHtml = points
    .map(
      (point) => `
        <text
          x="${point.x}"
          y="${height - 8}"
          font-size="10"
          fill="var(--color-text-faint)"
          text-anchor="middle"
        >
          ${escapeHtml(
            String(point.campaignName ?? "").slice(0, 10)
          )}
        </text>
      `
    )
    .join("");

  return `
    <svg
      viewBox="0 0 ${width} ${height}"
      style="
        width:100%;
        height:auto;
        max-width:${width}px;
      "
      role="img"
      aria-label="Click rate by campaign"
    >
      <line
        x1="${padding}"
        y1="${padding}"
        x2="${padding}"
        y2="${height - padding}"
        stroke="var(--color-border)"
      />

      <line
        x1="${padding}"
        y1="${height - padding}"
        x2="${width - padding}"
        y2="${height - padding}"
        stroke="var(--color-border)"
      />

      <text
        x="${padding - 8}"
        y="${padding}"
        font-size="10"
        fill="var(--color-text-faint)"
        text-anchor="end"
      >
        100%
      </text>

      <text
        x="${padding - 8}"
        y="${height - padding}"
        font-size="10"
        fill="var(--color-text-faint)"
        text-anchor="end"
      >
        0%
      </text>

      <path
        d="${pathD}"
        fill="none"
        stroke="var(--color-accent)"
        stroke-width="2"
      />

      ${dotsHtml}
      ${labelsHtml}
    </svg>
  `;
}

init();