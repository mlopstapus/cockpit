/* Claude Cockpit — Type definitions */

export type SessionStatus =
  | "starting"
  | "running"
  | "idle"
  | "rate_limited"
  | "error"
  | "stopped";

export type AuthStatus = "authenticated" | "needs_auth" | "authenticating" | "error";

export type MessageRole = "user" | "assistant" | "system";

export interface RepoInfo {
  name: string;
  path: string;
  description: string;
  default_branch: string;
  docker_compose: boolean;
  active_sessions: number;
}

export interface AccountInfo {
  id: string;
  name: string;
  tier: string;
  priority: number;
  auth_status: AuthStatus;
  is_rate_limited: boolean;
  messages_today: number;
  daily_estimate: number;
  usage_pct: number;
  active_sessions: number;
}

export interface SessionInfo {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  repo_path: string;
  account_id: string;
  status: SessionStatus;
  created_at: string;
  last_activity: string;
  message_count: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

export type WSMessageType =
  | "output"
  | "status"
  | "error"
  | "account_switch"
  | "task_complete";

export interface WSMessage {
  type: WSMessageType;
  session_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface CreateSessionRequest {
  project_id: string;
  name?: string;
  account_id?: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface SessionTemplate {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  account_id?: string;
  description?: string;
  color?: string;
  createdAt: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  repo_path: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
  session_count: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  repo_path: string;
  color?: string;
  icon?: string;
}
