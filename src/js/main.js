import "../css/base.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { convex, isConvexConfigured } from "./lib/convexClient.js";
import { api } from "../../convex/_generated/api.js";
import { requireSession, logout } from "./lib/session.js";

async function init() {
  const session = await requireSession();
  if (!session) return; // requireSession already redirected to login.html

  renderShell(session);
  checkConvexConnection();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("overview")}
      <main class="main">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1>Foundation</h1>
            <p>Phase 1/2 — project scaffold + authentication. Real screens arrive in later phases.</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:500;color:var(--color-text);">${session.name}</div>
            <button id="logout-btn" class="btn btn--secondary" style="margin-top:6px;padding:5px 12px;font-size:12px;">
              Log out
            </button>
          </div>
        </div>

        <div class="panel" style="max-width: 480px;">
          <div style="font-size:13px; font-weight:600; margin-bottom:12px;">
            Deployment pipeline status
          </div>

          <div id="convex-status" style="display:flex;align-items:center;font-size:13px;color:var(--color-text-muted);">
            <span class="status-dot status-dot--pending"></span>
            Checking Convex connection…
          </div>

          <p style="font-size:12.5px;color:var(--color-text-faint);margin-top:14px;line-height:1.6;">
            You are signed in as an authenticated administrator. Participants,
            Templates, Campaigns and Reports are built in the phases that follow.
          </p>
        </div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);
}

async function checkConvexConnection() {
  const statusEl = document.getElementById("convex-status");

  if (!isConvexConfigured()) {
    statusEl.innerHTML = `
      <span class="status-dot status-dot--error"></span>
      VITE_CONVEX_URL is not set — copy .env.example to .env.local and add your deployment URL.`;
    return;
  }

  try {
    const result = await convex.query(api.health.ping, {});
    statusEl.innerHTML = `
      <span class="status-dot status-dot--ok"></span>
      Connected — Convex responded at ${new Date(result.time).toLocaleTimeString()}`;
  } catch (err) {
    statusEl.innerHTML = `
      <span class="status-dot status-dot--error"></span>
      Convex URL is set but not reachable.`;
    console.error("Convex health check failed:", err);
  }
}

init();