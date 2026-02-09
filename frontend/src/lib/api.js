// In production, this will be the same origin (served by Caddy)
// In dev, point to the NUC's FastAPI server
const API_BASE = import.meta.env.VITE_API_URL || "";
async function request(path, options) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `API error: ${res.status}`);
    }
    return res.json();
}
export const api = {
    // Sessions
    listSessions: () => request("/api/sessions"),
    createSession: (body) => request("/api/sessions", {
        method: "POST",
        body: JSON.stringify(body),
    }),
    getSession: (id) => request(`/api/sessions/${id}`),
    sendMessage: (id, content) => request(`/api/sessions/${id}/send`, {
        method: "POST",
        body: JSON.stringify({ content }),
    }),
    sendOneshot: (id, content) => request(`/api/sessions/${id}/oneshot`, {
        method: "POST",
        body: JSON.stringify({ content }),
    }),
    stopSession: (id) => request(`/api/sessions/${id}`, {
        method: "DELETE",
    }),
    // Repos
    listRepos: () => request("/api/repos"),
    // Accounts
    listAccounts: () => request("/api/accounts"),
    resetAccountLimit: (id) => request(`/api/accounts/${id}/reset-limit`, {
        method: "POST",
    }),
    // Account Authentication
    getAuthStatus: (id) => request(`/api/accounts/${id}/auth-status`),
    startAuthentication: (id) => request(`/api/accounts/${id}/authenticate`, { method: "POST" }),
    confirmAuth: (id) => request(`/api/accounts/${id}/auth-confirm`, { method: "POST" }),
    // Health
    health: () => request("/api/health"),
};
// WebSocket helper
export function createSessionSocket(sessionId) {
    const wsBase = API_BASE.replace(/^http/, "ws") || `ws://${window.location.host}`;
    return new WebSocket(`${wsBase}/ws/sessions/${sessionId}`);
}
// WebSocket helper for auth streaming
export function createAuthSocket(accountId) {
    const wsBase = API_BASE.replace(/^http/, "ws") || `ws://${window.location.host}`;
    return new WebSocket(`${wsBase}/ws/accounts/${accountId}/auth-stream`);
}
