/**
 * src/js/templates.js
 *
 * Entry script for templates.html — the Templates management page:
 * list/search, add/edit form in a side drawer, activate/deactivate.
 *
 * WHY THIS EXISTS:
 * Phase 5's UI, structurally identical to Phase 4's participants.js —
 * reuses the same shared pieces (api.js, table.js, drawer.js,
 * sidebar.js, session.js) rather than duplicating patterns.
 *
 * CONNECTS TO:
 * - convex/http.ts's /templates/* routes, via src/js/lib/api.js
 * - src/js/ui/table.js, src/js/ui/drawer.js, src/js/ui/sidebar.js
 * - src/js/lib/session.js — requireSession() guards this page
 *
 * Per team convention: never calls fetch() directly — always
 * apiGet()/apiPost(); required fields are validated here before
 * calling the API, with convex/templates.ts remaining the real
 * source of truth for validation server-side.
 */

import "../css/base.css";
import "../css/table.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { renderTable } from "./ui/table.js";
import { openDrawer, closeDrawer } from "./ui/drawer.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet, apiPost } from "./lib/api.js";
import { escapeHtml } from "./ui/table.js";
import { confirmDialog } from "./ui/confirmDialog.js";
import { renderUserBadge } from "./ui/topbar.js";

let currentFilters = { active: "" };

async function init() {
  const session = await requireSession();
  if (!session) return;

  renderShell(session);
  await loadTemplates();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("templates")}
      <main class="main">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1>Templates</h1>
            <p>Reusable simulated-phishing email definitions.</p>
          </div>
          <div>
            ${renderUserBadge(session)}
          </div>
        </div>

        <div class="table-toolbar">
          <select id="active-filter">
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <div class="spacer"></div>
          <button id="add-template-btn" class="btn btn--primary">Add template</button>
        </div>

        <div id="table-container"></div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("add-template-btn").addEventListener("click", () => openTemplateDrawer(null));

  document.getElementById("active-filter").addEventListener("change", (e) => {
    currentFilters.active = e.target.value;
    loadTemplates();
  });
}

async function loadTemplates() {
  const container = document.getElementById("table-container");
  container.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const params = { active: currentFilters.active === "" ? undefined : currentFilters.active };
    const templates = await apiGet("/templates/list", params);

    renderTable(
      container,
      [
        { key: "name", label: "Name" },
        { key: "emailSubject", label: "Subject" },
        { key: "senderName", label: "Sender" },
        { key: "resendTemplateId", label: "Resend Template ID" },
        {
          key: "active",
          label: "Status",
          render: (row) =>
            row.active
              ? `<span class="status-pill status-pill--active">Active</span>`
              : `<span class="status-pill status-pill--inactive">Inactive</span>`,
        },
      ],
      templates,
      (row) => openTemplateDrawer(row)
    );
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load templates: ${err.message}</div>`;
    console.error("Failed to load templates:", err);
  }
}

function openTemplateDrawer(template) {
  const isEdit = Boolean(template);

  const html = `
    <h2>${isEdit ? "Edit template" : "Add template"}</h2>
    <div id="drawer-error" class="inline-error"></div>
    <form id="template-form">
      <div class="drawer-field">
        <label for="name">Name</label>
        <input type="text" id="name" required value="${isEdit ? escapeHtml(template.name) : ""}" />
      </div>
      <div class="drawer-field">
        <label for="description">Description</label>
        <input type="text" id="description" value="${isEdit ? escapeHtml(template.description || "") : ""}" />
      </div>
      <div class="drawer-field">
        <label for="emailSubject">Email subject</label>
        <input type="text" id="emailSubject" required value="${isEdit ? escapeHtml(template.emailSubject) : ""}" />
      </div>
      <div class="drawer-field">
        <label for="senderName">Sender name</label>
        <input type="text" id="senderName" required value="${isEdit ? escapeHtml(template.senderName) : ""}" />
      </div>
      <div class="drawer-field">
        <label for="resendTemplateId">Resend Template ID</label>
        <input type="text" id="resendTemplateId" required value="${isEdit ? escapeHtml(template.resendTemplateId) : ""}" />
      </div>
      <div class="drawer-actions">
        <button type="submit" class="btn btn--primary">${isEdit ? "Save changes" : "Add template"}</button>
        ${isEdit ? `<button type="button" id="toggle-active-btn" class="btn btn--secondary">${template.active ? "Deactivate" : "Activate"}</button>` : ""}
      </div>
    </form>`;

  const drawerEl = openDrawer(html);

  drawerEl.querySelector("#template-form").addEventListener("submit", (e) =>
    handleSaveTemplate(e, isEdit ? template._id : null)
  );

  if (isEdit) {
    drawerEl.querySelector("#toggle-active-btn").addEventListener("click", () =>
      handleToggleActive(template._id, !template.active)
    );
  }
}

function showDrawerError(message) {
  const el = document.getElementById("drawer-error");
  if (!el) return;
  el.textContent = message;
  el.classList.add("inline-error--visible");
}

/** Client-side validation before calling the API — server remains the source of truth. */
function validateTemplateForm(name, emailSubject, senderName, resendTemplateId) {
  if (!name.trim()) return "Name is required.";
  if (!emailSubject.trim()) return "Email subject is required.";
  if (!senderName.trim()) return "Sender name is required.";
  if (!resendTemplateId.trim()) return "Resend Template ID is required.";
  return null;
}

async function handleSaveTemplate(event, existingId) {
  event.preventDefault();

  const name = document.getElementById("name").value;
  const description = document.getElementById("description").value;
  const emailSubject = document.getElementById("emailSubject").value;
  const senderName = document.getElementById("senderName").value;
  const resendTemplateId = document.getElementById("resendTemplateId").value;

  const validationError = validateTemplateForm(name, emailSubject, senderName, resendTemplateId);
  if (validationError) {
    showDrawerError(validationError);
    return;
  }

  try {
    if (existingId) {
      await apiPost("/templates/update", {
        id: existingId, name, description, emailSubject, senderName, resendTemplateId,
      });
    } else {
      await apiPost("/templates/create", {
        name, description, emailSubject, senderName, resendTemplateId,
      });
    }
    closeDrawer();
    await loadTemplates();
  } catch (err) {
    showDrawerError(err.message);
  }
}

async function handleToggleActive(id, newActive) {
  const action = newActive ? "activate" : "deactivate";
  const confirmed = await confirmDialog({
    title: newActive ? "Activate template" : "Deactivate template",
    message: newActive 
      ? `Are you sure you want to activate this template?`
      : 'This template will no longer be available for use. This action can be reversed later.',
    confirmLabel: newActive ? "Activate" : "Deactivate",
  });
  if (!confirmed) return;

  try {
    await apiPost("/templates/set-active", { id, active: newActive });
    closeDrawer();
    await loadTemplates();
  } catch (err) {
    showDrawerError(err.message);
  }
}

init();