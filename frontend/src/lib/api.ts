/* Claude Cockpit — API Client */
import type {
  SessionInfo,
  RepoInfo,
  AccountInfo,
  ProjectInfo,
  CreateSessionRequest,
  CreateProjectRequest,
  SendMessageRequest,
} from "../types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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
  listSessions: () => request<SessionInfo[]>("/api/sessions"),

  createSession: (body: CreateSessionRequest) =>
    request<SessionInfo>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSession: (id: string) => request<SessionInfo>(`/api/sessions/${id}`),

  sendMessage: (id: string, content: string) =>
    request<{ status: string }>(`/api/sessions/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ content } satisfies SendMessageRequest),
    }),

  sendOneshot: (id: string, content: string) =>
    request<{ result: string }>(`/api/sessions/${id}/oneshot`, {
      method: "POST",
      body: JSON.stringify({ content } satisfies SendMessageRequest),
    }),

  stopSession: (id: string) =>
    request<{ status: string }>(`/api/sessions/${id}`, {
      method: "DELETE",
    }),

  // Projects
  listProjects: () => request<ProjectInfo[]>("/api/projects"),

  createProject: (body: CreateProjectRequest) =>
    request<ProjectInfo>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getProject: (id: string) => request<ProjectInfo>(`/api/projects/${id}`),

  updateProject: (id: string, body: Partial<CreateProjectRequest>) =>
    request<ProjectInfo>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteProject: (id: string) =>
    request<{ status: string }>(`/api/projects/${id}`, {
      method: "DELETE",
    }),

  getProjectSessions: (id: string) =>
    request<SessionInfo[]>(`/api/projects/${id}/sessions`),

  // Repos
  listRepos: () => request<RepoInfo[]>("/api/repos"),

  browseDirectories: (path?: string) =>
    request<{
      current: string;
      parent: string | null;
      is_git_repo: boolean;
      directories: Array<{ name: string; path: string; is_git_repo: boolean }>;
    }>(`/api/repos/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),

  // Accounts
  listAccounts: () => request<AccountInfo[]>("/api/accounts"),

  resetAccountLimit: (id: string) =>
    request<{ status: string }>(`/api/accounts/${id}/reset-limit`, {
      method: "POST",
    }),

  getAuthStatus: (id: string) =>
    request<{ account_id: string; status: string; needs_reauth: boolean }>(
      `/api/accounts/${id}/auth-status`
    ),

  startAuthentication: (id: string) =>
    request<{ account_id: string; status: string; message: string }>(
      `/api/accounts/${id}/authenticate`,
      { method: "POST" }
    ),

  confirmAuth: (id: string) =>
    request<{ account_id: string; status: string }>(
      `/api/accounts/${id}/auth-confirm`,
      { method: "POST" }
    ),

  // Health
  health: () => request<Record<string, unknown>>("/api/health"),
};

// WebSocket helper
export function createSessionSocket(sessionId: string): WebSocket {
  const wsBase = API_BASE.replace(/^http/, "ws") || `ws://${window.location.host}`;
  return new WebSocket(`${wsBase}/ws/sessions/${sessionId}`);
}

// WebSocket helper for auth streaming
export function createAuthSocket(accountId: string): WebSocket {
  const wsBase = API_BASE.replace(/^http/, "ws") || `ws://${window.location.host}`;
  return new WebSocket(`${wsBase}/ws/accounts/${accountId}/auth-stream`);
}
