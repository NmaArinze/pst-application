/**
 * src/js/ui/confirmDialog.js
 *
 * Reusable styled confirmation modal — replaces the browser's native
 * window.confirm() with something matching PST's white/black/orange
 * design, consistent with drawer.js's overlay pattern.
 *
 * WHY THIS EXISTS:
 * Destructive/state-changing one-click actions (deactivating a
 * participant or template, and later cancelling a campaign, etc.) need
 * a confirmation step — but the browser's default confirm() dialog is
 * unstyled and shows the raw hostname, which looks out of place in a
 * polished internal tool. This gives every page the same confirm UI.
 *
 * CONNECTS TO:
 * - src/css/table.css — houses this modal's styles (added this phase).
 * - src/js/participants.js, src/js/templates.js — first two callers.
 */

/**
 * Shows a confirmation modal and resolves true/false based on the
 * user's choice.
 *
 * @param {{ title: string, message: string, confirmLabel?: string }} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = "Confirm" }) {
  return new Promise((resolve) => {
    const wrapper = document.createElement("div");
    wrapper.className = "confirm-overlay";
    wrapper.innerHTML = `
      <div class="confirm-backdrop"></div>
      <div class="confirm-panel">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn--secondary" id="confirm-cancel-btn">Cancel</button>
          <button class="btn btn--primary" id="confirm-ok-btn">${confirmLabel}</button>
        </div>
      </div>`;

    document.body.appendChild(wrapper);

    const cleanup = (result) => {
      wrapper.remove();
      resolve(result);
    };

    wrapper.querySelector(".confirm-backdrop").addEventListener("click", () => cleanup(false));
    wrapper.querySelector("#confirm-cancel-btn").addEventListener("click", () => cleanup(false));
    wrapper.querySelector("#confirm-ok-btn").addEventListener("click", () => cleanup(true));
  });
}