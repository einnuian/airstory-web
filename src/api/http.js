// Backend mounts routes under `/api/...`. Paths in this file are like `/auth/login`.
// So the base must be `https://host/api` (NOT `https://host` alone), or every request 404s with "Not found".
function getDefaultApiBase() {
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  return isLocalhost
    ? "http://localhost:4000/api"
    : "https://air-sensor-api.onrender.com/api";
}

function normalizeApiBase(raw) {
  const fallback = getDefaultApiBase();
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  let u = (raw || fallback).trim().replace(/\/+$/, "");

  // Guardrail: if a localhost API URL is baked into a deployed build, ignore it.
  if (!isLocalhost && /localhost|127\.0\.0\.1/.test(u)) {
    u = fallback;
  }
  if (u.endsWith("/api")) return u;
  return `${u}/api`;
}
const API_BASE = normalizeApiBase(process.env.REACT_APP_API_BASE_URL);

export function getStoredAuth() {
  const raw = localStorage.getItem("air_auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuth(auth) {
  if (!auth) {
    localStorage.removeItem("air_auth");
    return;
  }
  localStorage.setItem("air_auth", JSON.stringify(auth));
}

export async function apiRequest(path, options = {}) {
  const auth = getStoredAuth();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options, /** If no method is specified here, fetch defaults to GET */
      headers,
    });
  } catch (err) {
    const isNetwork =
      err instanceof TypeError ||
      String(err?.message || "")
        .toLowerCase()
        .includes("failed to fetch");
    if (isNetwork) {
      throw new Error(
        "Network error — API unreachable or blocked (check CORS / FRONTEND_URL on the server, or VPN)."
      );
    }
    throw err;
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}
