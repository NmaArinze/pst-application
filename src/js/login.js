/**
 * src/js/login.js
 * Login page — two-panel visual layout (dark brand panel + light auth
 * card), reusing the existing real /auth/login fetch flow unchanged.
 * Password visibility toggle is the only new interactive element.
 */

import "../css/auth.css";
import shieldIcon from "lucide-static/icons/shield.svg?raw";
import eyeIcon from "lucide-static/icons/eye.svg?raw";
import eyeOffIcon from "lucide-static/icons/eye-off.svg?raw";
import checkShieldIcon from "lucide-static/icons/shield-check.svg?raw";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function sizeIcon(svg) {
  return svg.replace(/width="24"/, "").replace(/height="24"/, "");
}

function renderLoginForm() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="auth-shell">
      <aside class="auth-brand-panel">
        <div class="auth-brand-panel__pattern">
          <svg width="420" height="420" viewBox="0 0 400 400" fill="none" stroke="currentColor">
            <path d="M200 40 L340 90 V210 C340 295 200 360 200 360 C200 360 60 295 60 210 V90 Z" stroke-dasharray="4 4" stroke-width="1.2"/>
            <path d="M200 70 L310 110 V205 C310 270 200 325 200 325 C200 325 90 270 90 205 V110 Z" stroke-width="1.5"/>
            <line x1="200" y1="70" x2="200" y2="325" stroke-width="0.8"/>
            <line x1="90" y1="205" x2="310" y2="205" stroke-width="0.8"/>
          </svg>
        </div>
        <div class="auth-brand-panel__mark">
          <div class="auth-brand-panel__mark-icon">${sizeIcon(shieldIcon)}</div>
          <span class="auth-brand-panel__mark-name">PST</span>
        </div>
        <div class="auth-brand-panel__body">
          <div class="auth-brand-panel__title">Phishing Simulation Test</div>
          <div class="auth-brand-panel__desc">
            Security awareness simulations, managed from one secure console.
          </div>
        </div>
        <div class="auth-brand-panel__footer">
          ${sizeIcon(checkShieldIcon)}
          <span>Authorized personnel only</span>
        </div>
      </aside>

      <div class="auth-main-panel">
        <header class="auth-main-panel__header">
          <div class="auth-main-panel__header-mobile-brand">
            <div class="auth-main-panel__header-mobile-brand-icon">${sizeIcon(shieldIcon)}</div>
            <span style="font-weight:700;color:#ffffff;">PST</span>
          </div>
          </header>

        <div class="auth-card-wrap">
          <div class="auth-card">
            <span class="auth-card__chip">Admin Portal</span>
            <h1>Welcome back</h1>
            <p class="auth-card__subtitle">Sign in to your administrator account</p>

            <div id="auth-error" class="auth-error"></div>

            <form id="login-form">
              <div class="auth-field">
                <label for="email">Work email</label>
                <input type="email" id="email" name="email" required autocomplete="username" placeholder="name@company.com" />
              </div>
              <div class="auth-field auth-field--password">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <label for="password" style="margin-bottom:0;">Password</label>
                  <a href="forgot-password.html" style="font-size:11.5px;color:var(--color-accent);font-weight:500;">Forgot password?</a>
                </div>
                <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter your password" />
                <button type="button" id="toggle-password" class="auth-password-toggle" aria-label="Toggle password visibility">
                  ${sizeIcon(eyeIcon)}
                </button>
              </div>
              <button type="submit" class="btn btn--primary auth-submit" id="submit-btn">
                Sign in
              </button>
            </form>

            <div class="auth-card__footnote">
              ${sizeIcon(checkShieldIcon)}
              <span>Protected by hashed credentials and secure sessions</span>
            </div>
          </div>
        </div>

        <footer class="auth-main-panel__footer">
          &copy; ${new Date().getFullYear()} PST &bull; Phishing Simulation Test
        </footer>
      </div>
    </div>`;

  document.getElementById("login-form").addEventListener("submit", handleSubmit);
  document.getElementById("toggle-password").addEventListener("click", togglePasswordVisibility);
}

function togglePasswordVisibility() {
  const input = document.getElementById("password");
  const btn = document.getElementById("toggle-password");
  const isPassword = input.getAttribute("type") === "password";
  input.setAttribute("type", isPassword ? "text" : "password");
  btn.innerHTML = isPassword ? sizeIcon(eyeOffIcon) : sizeIcon(eyeIcon);
}

function showError(message) {
  const el = document.getElementById("auth-error");
  el.textContent = message;
  el.classList.add("auth-error--visible");
}

function clearError() {
  document.getElementById("auth-error").classList.remove("auth-error--visible");
}

// Unchanged real authentication flow — same endpoint, same credentials
// handling, same redirect, as before this visual redesign.
async function handleSubmit(event) {
  event.preventDefault();
  clearError();

  if (!CONVEX_SITE_URL) {
    showError("Application is not configured. Contact your administrator.");
    return;
  }

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const submitBtn = document.getElementById("submit-btn");

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  try {
    const res = await fetch(`${CONVEX_SITE_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      showError("Invalid email or password.");
      return;
    }

    window.location.href = "index.html";
  } catch (err) {
    showError("Invalid email or password.");
    console.error("Login failed:", err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
  }
}

renderLoginForm();