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
  stats: ContainerStats | null;
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

export interface RetryTaskResponse {
  original_task_id: string;
  new_task_id: string;
}

export interface DownloadTaskFileResult {
  filename: string;
  blob: Blob;
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
  compose_files: string[];
}

export interface WorkspaceSummary {
  workspace_id: string;
  repo_url: string | null;
  branch: string | null;
  created_at: string | null;
  updated_at: string;
  compose_files_count: number;
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

export type ComposeSource = 'repository' | 'custom';

export interface BuildServiceInfo {
  name: string;
  image: string | null;
}

export interface WorkspaceComposeInfo {
  workspace_id: string;
  compose_files: string[];
  selected_compose: string;
  source: ComposeSource;
  custom_exists: boolean;
  project_name: string;
  content: string;
  build_services: BuildServiceInfo[];
}

export interface WorkspaceComposeUpdatePayload {
  compose_path?: string;
  content: string;
}

export interface WorkspaceComposeUpdateResult {
  workspace_id: string;
  compose_path: string;
  custom_compose_path: string;
}

export interface WorkspaceComposeClearResult {
  workspace_id: string;
  compose_path: string;
  deleted: boolean;
}

export interface WorkspaceComposeActionPayload {
  compose_path?: string;
  source?: ComposeSource;
  project_name?: string;
  force_recreate?: boolean;
  confirm?: boolean;
}

export interface ProxyConfig {
  proxy_url: string | null;
}

export interface UpdateProxyPayload {
  proxy_url: string | null;
}

export interface EnvVariable {
  key: string;
  value: string;
  comment: string;
}

export interface WorkspaceEnvInfo {
  workspace_id: string;
  env_templates: string[];
  selected_template: string | null;
  target_path: string | null;
  custom_exists: boolean;
  template_content: string;
  template_variables: EnvVariable[];
  custom_content: string;
  custom_variables: EnvVariable[];
}

export interface WorkspaceEnvUpdatePayload {
  template_path: string;
  content: string;
}

export interface WorkspaceProjectNamePayload {
  compose_path?: string;
  project_name: string;
}

export interface WorkspaceImageTagsPayload {
  compose_path?: string;
  source?: string;
  image_tags: Record<string, string>;
}
