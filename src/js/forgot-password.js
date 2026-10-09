/**
 * src/js/forgot-password.js
 * Behavior for forgot-password.html: submits the email and always shows
 * the same generic confirmation (the backend never reveals whether an
 * account exists). Markup lives in the HTML; styling in auth.css.
 */
import shieldIcon from "lucide-static/icons/shield.svg?raw";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function sizeIcon(svg) {
  return svg.replace(/width="24"/, "").replace(/height="24"/, "");
}

document.getElementById("brand-mark").innerHTML = sizeIcon(shieldIcon);
document.getElementById("forgot-form").addEventListener("submit", handleSubmit);

async function handleSubmit(event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const submitBtn = document.getElementById("submit-btn");
  const messageEl = document.getElementById("form-message");

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const res = await fetch(`${CONVEX_SITE_URL}/auth/forgot-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    messageEl.textContent =
      data.message || "If an account exists for this email, we've sent instructions to reset your password.";
    messageEl.classList.add("auth-error--success", "auth-error--visible");
    document.getElementById("forgot-form").classList.add("is-hidden");
  } catch (err) {
    messageEl.textContent = "Something went wrong. Please try again.";
    messageEl.classList.remove("auth-error--success");
    messageEl.classList.add("auth-error--visible");
    console.error("Forgot password request failed:", err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset link";
  }
}