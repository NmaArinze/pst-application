/**
 * src/js/ui/feedback.js
 * Small reusable success/error banner for pages without a drawer (e.g.
 * email-queue.html). Complements confirmDialog.js for the confirm step.
 */

export function showFeedback(containerEl, message, type = "success") {
  containerEl.textContent = message;
  containerEl.className = `inline-error inline-error--visible ${type === "success" ? "inline-error--success" : ""}`;
}

export function clearFeedback(containerEl) {
  containerEl.textContent = "";
  containerEl.className = "inline-error";
}