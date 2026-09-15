/**
 * src/js/participants.js
 *
 * Entry script for participants.html — the Participants management
 * page: searchable/filterable table, add/edit form in a side drawer,
 * activate/deactivate toggle.
 *
 * WHY THIS EXISTS:
 * Phase 4's actual UI. Ties together the shared pieces built earlier
 * this phase: api.js (authenticated fetch), table.js (list rendering),
 * drawer.js (add/edit panel), plus session.js (Phase 2's route guard)
 * and sidebar.js (Phase 1's nav shell).
 *
 * CONNECTS TO:
 * - convex/http.ts's /participants/* routes, via src/js/lib/api.js
 * - src/js/ui/table.js, src/js/ui/drawer.js, src/js/ui/sidebar.js
 * - src/js/lib/session.js — requireSession() guards this page
 *
 * Per team convention: this page never calls fetch() directly — every
 * request goes through apiGet()/apiPost() from lib/api.js, and every
 * required field is validated here, client-side, before calling the
 * API (the server in convex/participants.ts remains the real source of
 * truth for validation either way).
 */

import "../css/base.css";
import "../css/table.css";
import { renderSidebar, bindSidebarNav } from "./ui/sidebar.js";
import { renderTable } from "./ui/table.js";
import { openDrawer, closeDrawer } from "./ui/drawer.js";
import { requireSession, logout } from "./lib/session.js";
import { apiGet, apiPost } from "./lib/api.js";
import { confirmDialog } from "./ui/confirmDialog.js";

let currentFilters = { search: "", department: "", active: "" };

async function init() {
  const session = await requireSession();
  if (!session) return;

  renderShell(session);
  await loadParticipants();
}

function renderShell(session) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar("participants")}
      <main class="main">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1>Participants</h1>
            <p>Manage the staff enrolled in phishing-awareness campaigns.</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:500;color:var(--color-text);">${session.name}</div>
            <button id="logout-btn" class="btn btn--secondary" style="margin-top:6px;padding:5px 12px;font-size:12px;">
              Log out
            </button>
          </div>
        </div>

        <div class="table-toolbar">
          <input type="text" id="search-input" placeholder="Search name, email, department…" />
          <select id="department-filter">
            <option value="">All departments</option>
          </select>
          <select id="active-filter">
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <div class="spacer"></div>
          <button id="add-participant-btn" class="btn btn--primary">Add participant</button>
        </div>

        <div id="table-container"></div>
      </main>
    </div>`;

  bindSidebarNav(app);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("add-participant-btn").addEventListener("click", () => openParticipantDrawer(null));

  document.getElementById("search-input").addEventListener("input", debounce((e) => {
    currentFilters.search = e.target.value;
    loadParticipants();
  }, 300));

  document.getElementById("department-filter").addEventListener("change", (e) => {
    currentFilters.department = e.target.value;
    loadParticipants();
  });

  document.getElementById("active-filter").addEventListener("change", (e) => {
    currentFilters.active = e.target.value;
    loadParticipants();
  });
}

function debounce(fn, delayMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

async function loadParticipants() {
  const container = document.getElementById("table-container");
  container.innerHTML = `<div class="table-empty">Loading…</div>`;

  try {
    const params = {
      search: currentFilters.search || undefined,
      department: currentFilters.department || undefined,
      active: currentFilters.active === "" ? undefined : currentFilters.active,
    };
    const participants = await apiGet("/participants/list", params);

    populateDepartmentFilter(participants);

    renderTable(
      container,
      [
        { key: "firstName", label: "Name", render: (row) => `${row.firstName} ${row.surname}` },
        { key: "email", label: "Email" },
        { key: "department", label: "Department" },
        {
          key: "active",
          label: "Status",
          render: (row) =>
            row.active
              ? `<span class="status-pill status-pill--active">Active</span>`
              : `<span class="status-pill status-pill--inactive">Inactive</span>`,
        },
        { key: "participantCode", label: "ID" },
      ],
      participants,
      (row) => openParticipantDrawer(row)
    );
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load participants: ${err.message}</div>`;
    console.error("Failed to load participants:", err);
  }
}

/** Populates the department dropdown from whatever departments currently exist in the data — never hardcoded. */
function populateDepartmentFilter(participants) {
  const select = document.getElementById("department-filter");
  const currentValue = select.value;
  const departments = [...new Set(participants.map((p) => p.department))].sort();

  select.innerHTML =
    `<option value="">All departments</option>` +
    departments.map((d) => `<option value="${d}">${d}</option>`).join("");

  select.value = currentValue;
}

function openParticipantDrawer(participant) {
  const isEdit = Boolean(participant);

  const html = `
    <h2>${isEdit ? "Edit participant" : "Add participant"}</h2>
    <div id="drawer-error" class="auth-error"></div>
    <form id="participant-form">
      <div class="drawer-field">
        <label for="firstName">First name</label>
        <input type="text" id="firstName" required value="${isEdit ? participant.firstName : ""}" />
      </div>
      <div class="drawer-field">
        <label for="surname">Surname</label>
        <input type="text" id="surname" required value="${isEdit ? participant.surname : ""}" />
      </div>
      <div class="drawer-field">
        <label for="email">Email</label>
        <input type="email" id="email" required value="${isEdit ? participant.email : ""}" />
      </div>
      <div class="drawer-field">
        <label for="department">Department</label>
        <input type="text" id="department" required value="${isEdit ? participant.department : ""}" />
      </div>
      <div class="drawer-actions">
        <button type="submit" class="btn btn--primary">${isEdit ? "Save changes" : "Add participant"}</button>
        ${isEdit ? `<button type="button" id="toggle-active-btn" class="btn btn--secondary">${participant.active ? "Deactivate" : "Activate"}</button>` : ""}
      </div>
    </form>`;

  const drawerEl = openDrawer(html);

  drawerEl.querySelector("#participant-form").addEventListener("submit", (e) =>
    handleSaveParticipant(e, isEdit ? participant._id : null)
  );

  if (isEdit) {
    drawerEl.querySelector("#toggle-active-btn").addEventListener("click", () =>
      handleToggleActive(participant._id, !participant.active)
    );
  }
}

function showDrawerError(message) {
  const el = document.getElementById("drawer-error");
  if (!el) return;
  el.textContent = message;
  el.classList.add("auth-error--visible");
}

/**
 * Client-side validation before calling the API — the server in
 * convex/participants.ts still re-validates independently; this is
 * just fast feedback, not the source of truth.
 */
function validateParticipantForm(firstName, surname, email, department) {
  if (!firstName.trim()) return "First name is required.";
  if (!surname.trim()) return "Surname is required.";
  if (!email.trim() || !email.includes("@")) return "A valid email is required.";
  if (!department.trim()) return "Department is required.";
  return null;
}

async function handleSaveParticipant(event, existingId) {
  event.preventDefault();

  const firstName = document.getElementById("firstName").value;
  const surname = document.getElementById("surname").value;
  const email = document.getElementById("email").value;
  const department = document.getElementById("department").value;

  const validationError = validateParticipantForm(firstName, surname, email, department);
  if (validationError) {
    showDrawerError(validationError);
    return;
  }

  try {
    if (existingId) {
      await apiPost("/participants/update", { id: existingId, firstName, surname, email, department });
    } else {
      await apiPost("/participants/create", { firstName, surname, email, department });
    }
    closeDrawer();
    await loadParticipants();
  } catch (err) {
    showDrawerError(err.message);
  }
}

async function handleToggleActive(id, newActive) {
  const action = newActive ? "activate" : "deactivate";
  const confirmed = await confirmDialog({
    title: newActive ? "Activate participant" : "Deactivate participant",
    message: newActive 
    ? `Are you sure you want to activate this participant?`
    : 'This particpants will no longer receive phishing campaigns. This action can be reversed later.',
    confirmLabel: newActive ? "Activate" : "Deactivate",
  });
  if (!confirmed) return;

  try {
    await apiPost("/participants/set-active", { id, active: newActive });
    closeDrawer();
    await loadParticipants();
  } catch (err) {
    showDrawerError(err.message);
  }
}

init();