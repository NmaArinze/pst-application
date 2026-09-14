/**
 * Renders the shared PST sidebar shell.
 * Reused by every page so navigation structure only lives in one place.
 *
 * @param {string} activePage - one of: overview | campaigns | participants | templates | reports
 * @returns {string} HTML string for the sidebar element
 */
export function renderSidebar(activePage) {
  const items = [
    { key: "overview", label: "Overview", page: "index.html", available: true },
    { key: "campaigns", label: "Campaigns", page: "campaigns.html", available: false },
    { key: "participants", label: "Participants", page: "participants.html", available: true },
    { key: "templates", label: "Templates", page: "templates.html", available: false },
    { key: "reports", label: "Reports", page: "reports.html", available: false },
  ];

  const navHtml = items
    .map((item) => {
      const isActive = item.key === activePage;
      const disabledAttr = item.available ? "" : 'data-disabled="true"';
      const hrefAttr = item.available ? `data-href="${item.page}"` : "";
      const badge = item.available ? "" : '<span class="nav-item__badge">soon</span>';
      return `
        <button class="nav-item" ${disabledAttr} ${hrefAttr}
          ${isActive ? 'aria-current="page"' : ""}>
          <span>${item.label}</span>
          ${badge}
        </button>`;
    })
    .join("");

  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <span class="sidebar__brand-mark">&#128737;</span>
        <span class="sidebar__brand-name">PST</span>
      </div>
      <nav class="sidebar__nav">${navHtml}</nav>
      <div class="sidebar__footer">
        <div style="font-size:12px;color:var(--color-text-faint);">
          Phishing Simulation Test
        </div>
      </div>
    </aside>`;
}

/**
 * Wires click-to-navigate behavior on the rendered sidebar.
 * Buttons without data-href are intentionally inert (page not built yet).
 */
export function bindSidebarNav(root) {
  root.querySelectorAll(".nav-item[data-href]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = btn.dataset.href;
    });
  });
}