/**
 * src/js/ui/topbar.js
 * Shared user badge (avatar initials + name) for every page's
 * top-right corner. Logout now lives in the sidebar footer instead.
 */

import { escapeHtml } from "./table.js";

function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const second = parts[1]?.[0] || "";
  return (first + second).toUpperCase() || "?";
}

export function renderUserBadge(session) {
  return `
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="user-avatar">${getInitials(session.name)}</div>
      <div style="font-size:13px;font-weight:600;color:var(--color-text);">${escapeHtml(session.name)}</div>
    </div>`;
}