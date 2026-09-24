/**
 * src/js/ui/sidebar.js
 * Shared sidebar: icon + label nav on desktop, icon-only with
 * accessible labels/tooltips below 900px. Icons from lucide-static
 * (raw SVG, no framework needed) — see vite.config.js for the ?raw
 * import support this relies on.
 */

import layoutDashboardIcon from "lucide-static/icons/layout-dashboard.svg?raw";
import megaphoneIcon from "lucide-static/icons/megaphone.svg?raw";
import usersIcon from "lucide-static/icons/users.svg?raw";
import fileTextIcon from "lucide-static/icons/file-text.svg?raw";
import mailIcon from "lucide-static/icons/mail.svg?raw";
import barChartIcon from "lucide-static/icons/bar-chart-3.svg?raw";
import logOutIcon from "lucide-static/icons/log-out.svg?raw";

/** Strips the default width/height from lucide's SVG so our CSS controls sizing. */
function sizeIcon(svg) {
  return svg.replace(/width="24"/, '').replace(/height="24"/, '');
}

const ICONS = {
  overview: sizeIcon(layoutDashboardIcon),
  campaigns: sizeIcon(megaphoneIcon),
  participants: sizeIcon(usersIcon),
  templates: sizeIcon(fileTextIcon),
  "email-queue": sizeIcon(mailIcon),
  reports: sizeIcon(barChartIcon),
};

export function renderSidebar(activePage) {
  const items = [
    { key: "overview", label: "Overview", page: "index.html", available: true },
    { key: "campaigns", label: "Campaigns", page: "campaigns.html", available: true },
    { key: "participants", label: "Participants", page: "participants.html", available: true },
    { key: "templates", label: "Templates", page: "templates.html", available: true },
    { key: "email-queue", label: "Email Queue", page: "email-queue.html", available: true },
    { key: "reports", label: "Reports", page: "reports.html", available: true },
  ];

  const navHtml = items
    .map((item) => {
      const isActive = item.key === activePage;
      const hrefAttr = item.available ? `data-href="${item.page}"` : "";
      return `
        <button class="nav-item" ${hrefAttr}
          ${isActive ? 'aria-current="page"' : ""}
          aria-label="${item.label}" title="${item.label}">
          <span class="nav-item__icon">${ICONS[item.key]}</span>
          <span class="nav-item__label">${item.label}</span>
        </button>`;
    })
    .join("");

  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <span class="sidebar__brand-mark">&#128737;</span>
        <span class="sidebar__brand-name" style="color:var(--color-accent);font-size:16px;">PST</span>
      </div>
      <div class="sidebar__section-label">Workspace</div>
      <nav class="sidebar__nav">${navHtml}</nav>
      <div class="sidebar__footer">
        <button id="logout-btn" class="nav-item" aria-label="Sign out" title="Sign out">
          <span class="nav-item__icon">${sizeIcon(logOutIcon)}</span>
          <span class="nav-item__label">Sign out</span>
        </button>
        <div style="font-size:11px;color:var(--color-text-faint);margin-top:8px;" class="sidebar__footer-text">
          Phishing Simulation Test
        </div>
      </div>
    </aside>`;
}

export function bindSidebarNav(root) {
  root.querySelectorAll(".nav-item[data-href]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = btn.dataset.href;
    });
  });
}