const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL;

/**
 * Asks the server "is there a valid session cookie?" — the browser never
 * stores or reads the token itself, so there's nothing for JavaScript
 * (or an XSS attack) to steal.
 */
export async function requireSession() {
  if (!CONVEX_SITE_URL) {
    window.location.href = "login.html";
    return null;
  }

  try {
    const res = await fetch(`${CONVEX_SITE_URL}/auth/session`, {
      method: "GET",
      credentials: "include",
    });
    const result = await res.json();

    if (!result.valid) {
      window.location.href = "login.html";
      return null;
    }
    return result;
  } catch (err) {
    console.error("Session check failed:", err);
    window.location.href = "login.html";
    return null;
  }
}

export async function logout() {
  if (CONVEX_SITE_URL) {
    try {
      await fetch(`${CONVEX_SITE_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Logout request failed:", err);
    }
  }
  window.location.href = "login.html";
}