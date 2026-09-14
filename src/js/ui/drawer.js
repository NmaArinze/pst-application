/**
 * src/js/ui/drawer.js
 *
 * Reusable right-side detail drawer — a slide-in panel with a
 * dimmed backdrop, used to show/edit a single record's details.
 *
 * WHY THIS EXISTS:
 * Same reasoning as table.js — Participants (this phase), and later
 * Campaigns/Templates, all need a "click a row, see details in a
 * drawer" pattern. This file owns only the drawer's open/close
 * mechanics and shell; the actual content (form fields, buttons) is
 * passed in by whichever page uses it.
 *
 * CONNECTS TO:
 * - src/css/table.css — includes the drawer's styling alongside the
 *   table styling (kept in one shared stylesheet for this phase).
 * - src/js/participants.js — the first page to use this.
 */

let currentDrawerEl = null;

/**
 * Opens a drawer with the given inner HTML content.
 * Closes any drawer already open first, so only one can exist at a time.
 *
 * @param {string} contentHtml - HTML to render inside the drawer panel
 * @param {() => void} [onClose] - optional callback run when the drawer closes
 */
export function openDrawer(contentHtml, onClose) {
  closeDrawer();

  const wrapper = document.createElement("div");
  wrapper.className = "drawer-overlay";
  wrapper.innerHTML = `
    <div class="drawer-backdrop"></div>
    <div class="drawer-panel">
      <button class="drawer-close" aria-label="Close">&times;</button>
      <div class="drawer-content">${contentHtml}</div>
    </div>`;

  document.body.appendChild(wrapper);
  currentDrawerEl = wrapper;

  const close = () => {
    closeDrawer();
    if (onClose) onClose();
  };

  wrapper.querySelector(".drawer-backdrop").addEventListener("click", close);
  wrapper.querySelector(".drawer-close").addEventListener("click", close);

  return wrapper; // caller can query inside this for form fields, buttons, etc.
}

export function closeDrawer() {
  if (currentDrawerEl) {
    currentDrawerEl.remove();
    currentDrawerEl = null;
  }
}