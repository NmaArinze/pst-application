import "../css/auth.css";

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

function renderLoginForm() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card__brand">
          <span class="auth-card__brand-mark">&#128737;</span>
          <span class="auth-card__brand-name">PST</span>
        </div>
        <h1>Sign in</h1>
        <p class="auth-card__subtitle">Phishing Simulation Test — administrator access</p>

        <div id="auth-error" class="auth-error"></div>

        <form id="login-form">
          <div class="auth-field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autocomplete="username" />
          </div>
          <div class="auth-field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn--primary auth-submit" id="submit-btn">
            Sign in
          </button>
        </form>
      </div>
    </div>`;

  document.getElementById("login-form").addEventListener("submit", handleSubmit);
}

function showError(message) {
  const el = document.getElementById("auth-error");
  el.textContent = message;
  el.classList.add("auth-error--visible");
}

function clearError() {
  document.getElementById("auth-error").classList.remove("auth-error--visible");
}

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