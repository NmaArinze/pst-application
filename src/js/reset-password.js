/**
 * src/js/reset-password.js
 * Behavior for reset-password.html (?token=...): shows the form only
 * when a token is present, then calls /auth/reset-password. No session
 * exists at this point. Markup lives in the HTML; styling in auth.css.
 */
import shieldIcon from "lucide-static/icons/shield.svg?raw";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function sizeIcon(svg) {
  return svg.replace(/width="24"/, "").replace(/height="24"/, "");
}

const token = new URLSearchParams(window.location.search).get("token");

document.getElementById("brand-mark").innerHTML = sizeIcon(shieldIcon);

if (token) {
  const form = document.getElementById("reset-form");
  form.classList.remove("is-hidden");
  form.addEventListener("submit", handleSubmit);
} else {
  document.getElementById("invalid-link-note").classList.remove("is-hidden");
}

async function handleSubmit(event) {
  event.preventDefault();
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const submitBtn = document.getElementById("submit-btn");
  const messageEl = document.getElementById("form-message");

  messageEl.classList.remove("auth-error--visible");

  if (newPassword !== confirmPassword) {
    messageEl.textContent = "Passwords do not match.";
    messageEl.classList.add("auth-error--visible");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Updating…";

  try {
    const res = await fetch(`${CONVEX_SITE_URL}/auth/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();

    if (!res.ok) {
      messageEl.textContent = data.error || "Could not reset password.";
      messageEl.classList.add("auth-error--visible");
      return;
    }

    window.location.href = "login.html";
  } catch (err) {
    messageEl.textContent = "Something went wrong. Please try again.";
    messageEl.classList.add("auth-error--visible");
    console.error("Reset password failed:", err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Update password";
  }
}