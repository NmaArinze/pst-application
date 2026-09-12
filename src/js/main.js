import "../css/base.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { convex, isConvexConfigured } from "./lib/convexClient.js";
import { api } from "../../convex/_generated/api.js";

function renderShell() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("overview")}
      <main class="main">
        <div class="page-header">
          <h1>Foundation</h1>
          <p>Phase 1 — project scaffold. Real screens arrive in later phases.</p>
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
            This page confirms the frontend is deployed and can reach the
            Convex backend. Login, Participants, Templates, Campaigns and
            Reports are built in the phases that follow.
          </p>
        </div>
      </main>
    </div>`;

  bindSidebarNav(app);
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
      Convex URL is set but not reachable. Run <code>npm run convex:dev</code> to deploy convex/health.ts.`;
    console.error("Convex health check failed:", err);
  }
}

renderShell();
checkConvexConnection();