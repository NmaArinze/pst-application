/**
 * src/js/ui/table.js
 *
 * Reusable table renderer — builds an HTML table from column
 * definitions + row data, with each row clickable to open a detail
 * drawer (see src/js/ui/drawer.js).
 *
 * WHY THIS EXISTS:
 * Participants (this phase), and later Campaigns, Templates, and
 * Reports, all need the same basic pattern: a searchable/filterable
 * table where clicking a row shows more detail. Building this once
 * here means every future page reuses it instead of hand-rolling table
 * markup repeatedly — same reasoning as src/js/ui/sidebar.js in Phase 1.
 *
 * CONNECTS TO:
 * - src/css/table.css — the styling this markup expects.
 * - src/js/participants.js — the first page to use this.
 */

/**
 * Renders a table into the given container element.
 *
 * @param {HTMLElement} container - where to render the table
 * @param {Array<{key: string, label: string, render?: (row) => string}>} columns
 * @param {Array<object>} rows - data rows; each needs a unique `_id`
 * @param {(row: object) => void} onRowClick - called with the row's data when clicked
 */
export function renderTable(container, columns, rows, onRowClick) {
  if (rows.length === 0) {
    container.innerHTML = `
      <div class="table-empty">No results found.</div>`;
    return;
  }

  const headerHtml = columns.map((col) => `<th>${col.label}</th>`).join("");

  const bodyHtml = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const value = col.render ? col.render(row) : (row[col.key] ?? "");
          return `<td>${value}</td>`;
        })
        .join("");
      return `<tr data-row-id="${row._id}">${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <table class="data-table">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>`;

  container.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      const row = rows.find((r) => r._id === tr.dataset.rowId);
      if (row) onRowClick(row);
    });
  });
}