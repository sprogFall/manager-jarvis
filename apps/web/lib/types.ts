export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string[];
  stats: ContainerStats | null;
}

export interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  command: string;
  created: string;
  env: string[];
  mounts: Array<Record<string, unknown>>;
  networks: Record<string, unknown>;
  ports: Record<string, unknown>;
}

export interface ImageSummary {
  id: string;
  tags: string[];
  size: number;
  created: string;
}

export interface StackSummary {
  name: string;
  path: string;
  compose_file: string;
  services: Array<Record<string, unknown>>;
}

export interface TaskRecord {
  id: string;
  task_type: string;
  status: string;
  resource_type: string | null;
  resource_id: string | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  retry_of: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface AuditLogRecord {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  status: string;
  detail: Record<string, unknown> | null;
  created_at: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface PullImagePayload {
  image: string;
  tag?: string;
}

export interface TaskResponse {
  task_id: string;
}

export interface GitClonePayload {
  repo_url: string;
  branch?: string;
  token?: string;
}

export interface WorkspaceInfo {
  workspace_id: string;
  dockerfiles: string[];
  directories: string[];
}

export interface BuildFromWorkspacePayload {
  tag: string;
  context_path?: string;
  dockerfile?: string;
  no_cache?: boolean;
  pull?: boolean;
  cleanup_after?: boolean;
}

export interface LoadFromUrlPayload {
  url: string;
  auth_token?: string;
}

export interface ProxyConfig {
  proxy_url: string | null;
}

export interface UpdateProxyPayload {
  proxy_url: string | null;
}
