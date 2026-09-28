/**
 * src/js/reset-password.js
 * Set-new-password step (?token=...). Calls /auth/reset-password
 * directly — no session exists at this point.
 */
import "../css/auth.css";
import shieldIcon from "lucide-static/icons/shield.svg?raw";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function sizeIcon(svg) {
  return svg.replace(/width="24"/, "").replace(/height="24"/, "");
}

function getToken() {
  return new URLSearchParams(window.location.search).get("token");
}

function render() {
  const token = getToken();

  document.getElementById("app").innerHTML = `
    <div class="auth-shell">
      <div class="auth-main-panel" style="margin: 0 auto;">
        <div class="auth-card-wrap">
          <div class="auth-card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
              <div style="width:28px;height:28px;border-radius:8px;background:var(--color-accent);display:flex;align-items:center;justify-content:center;">${sizeIcon(shieldIcon)}</div>
              <span style="font-weight:700;color:var(--color-text);">PST</span>
            </div>
            <h1>Set new password</h1>
            <p class="auth-card__subtitle">Choose a new password for your account.</p>

            <div id="form-message" class="auth-error"></div>

            ${
              token
                ? `<form id="reset-form">
                    <div class="auth-field">
                      <label for="newPassword">New password</label>
                      <input type="password" id="newPassword" required autocomplete="new-password" />
                    </div>
                    <div class="auth-field">
                      <label for="confirmPassword">Confirm new password</label>
                      <input type="password" id="confirmPassword" required autocomplete="new-password" />
                    </div>
                    <button type="submit" class="btn btn--primary auth-submit" id="submit-btn">Update password</button>
                  </form>`
                : `<p style="font-size:13px;color:var(--color-text-muted);">This reset link is missing or invalid.</p>`
            }

            <div style="text-align:center;margin-top:18px;">
              <a href="login.html" style="font-size:12.5px;color:var(--color-text-faint);">&larr; Back to sign in</a>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  if (token) {
    document.getElementById("reset-form").addEventListener("submit", (e) => handleSubmit(e, token));
  }
}

async function handleSubmit(event, token) {
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

render();