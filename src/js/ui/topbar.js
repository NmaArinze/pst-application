/**
 * src/js/ui/topbar.js
 * Shared user badge (avatar initials + name) for the top-right of every
 * app page. Logout lives in the sidebar. Styling: base.css.
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
    <div class="user-badge">
      <div class="user-avatar">${getInitials(session.name)}</div>
      <div class="user-badge__name">${escapeHtml(session.name)}</div>
    </div>`;
}