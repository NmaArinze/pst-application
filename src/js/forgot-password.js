/**
 * src/js/forgot-password.js
 * Enter-email step of the password reset flow. Always shows the same
 * generic confirmation — the backend never reveals whether an account
 * exists for the entered email.
 */
import "../css/auth.css";
import shieldIcon from "lucide-static/icons/shield.svg?raw";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function sizeIcon(svg) {
  return svg.replace(/width="24"/, "").replace(/height="24"/, "");
}

function render() {
  document.getElementById("app").innerHTML = `
    <div class="auth-shell">
      <div class="auth-main-panel" style="margin: 0 auto;">
        <div class="auth-card-wrap">
          <div class="auth-card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
              <div style="width:28px;height:28px;border-radius:8px;background:var(--color-accent);display:flex;align-items:center;justify-content:center;">${sizeIcon(shieldIcon)}</div>
              <span style="font-weight:700;color:var(--color-text);">PST</span>
            </div>
            <h1>Reset your password</h1>
            <p class="auth-card__subtitle">Enter your work email and we'll send you a reset link.</p>

            <div id="form-message" class="auth-error"></div>

            <form id="forgot-form">
              <div class="auth-field">
                <label for="email">Work email</label>
                <input type="email" id="email" required autocomplete="username" placeholder="name@company.com" />
              </div>
              <button type="submit" class="btn btn--primary auth-submit" id="submit-btn">Send reset link</button>
            </form>

            <div style="text-align:center;margin-top:18px;">
              <a href="login.html" style="font-size:12.5px;color:var(--color-text-faint);">&larr; Back to sign in</a>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("forgot-form").addEventListener("submit", handleSubmit);
}

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

    messageEl.textContent = data.message || "If an account exists for this email, we've sent instructions to reset your password.";
    messageEl.style.color = "var(--color-status-success)";
    messageEl.style.background = "#e7f1ee";
    messageEl.classList.add("auth-error--visible");
    document.getElementById("forgot-form").style.display = "none";
  } catch (err) {
    messageEl.textContent = "Something went wrong. Please try again.";
    messageEl.classList.add("auth-error--visible");
    console.error("Forgot password request failed:", err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset link";
  }
}

render();