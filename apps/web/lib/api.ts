import type {
  AuditLogRecord,
  BuildFromWorkspacePayload,
  ComposeSource,
  ContainerDetail,
  ContainerSummary,
  DownloadTaskFileResult,
  GitClonePayload,
  ImageSummary,
  LoadFromUrlPayload,
  LoginPayload,
  PullImagePayload,
  ProxyConfig,
  RetryTaskResponse,
  StackSummary,
  TaskRecord,
  TaskResponse,
  TokenResponse,
  UpdateProxyPayload,
  WorkspaceComposeActionPayload,
  WorkspaceComposeClearResult,
  WorkspaceComposeInfo,
  WorkspaceComposeUpdatePayload,
  WorkspaceComposeUpdateResult,
  WorkspaceEnvInfo,
  WorkspaceEnvUpdatePayload,
  WorkspaceImageTagsPayload,
  WorkspaceInfo,
  WorkspaceProjectNamePayload,
  WorkspaceSummary,
} from '@/lib/types';

function trimSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function extractErrorMessage(text: string): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.detail === 'string' && record.detail.trim()) {
        return record.detail.trim();
      }
      if (record.detail && typeof record.detail === 'object') {
        const detail = record.detail as Record<string, unknown>;
        if (typeof detail.message === 'string' && detail.message.trim()) {
          return detail.message.trim();
        }
        return JSON.stringify(record.detail);
      }
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
      }
    }
  } catch {
    // Ignore JSON parse failures; fall back to raw text.
  }
  return raw;
}

function filenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;

  const utf8Match = value.match(/filename\\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const match = value.match(/filename=\"?([^\";]+)\"?/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = trimSlash(baseUrl);
    this.token = token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      const message = extractErrorMessage(text);
      throw new Error(message || `Request failed: ${response.status ?? ''}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async requestText(path: string, init: RequestInit = {}): Promise<string> {
    const headers = new Headers(init.headers);
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      const message = extractErrorMessage(text);
      throw new Error(message || `Request failed: ${response.status ?? ''}`);
    }

    return await response.text();
  }

  static async login(baseUrl: string, payload: LoginPayload): Promise<TokenResponse> {
    const response = await fetch(`${trimSlash(baseUrl)}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || '登录失败');
    }

    return (await response.json()) as TokenResponse;
  }

  getContainers(): Promise<ContainerSummary[]> {
    return this.request<ContainerSummary[]>('/api/v1/containers?include_stats=false');
  }

  getContainerDetail(containerId: string): Promise<ContainerDetail> {
    return this.request<ContainerDetail>(`/api/v1/containers/${containerId}`);
  }

  actionContainer(containerId: string, action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void> {
    const suffix = action === 'kill' ? '?confirm=true' : '';
    return this.request<void>(`/api/v1/containers/${containerId}/${action}${suffix}`, { method: 'POST' });
  }

  removeContainer(containerId: string): Promise<void> {
    return this.request<void>(`/api/v1/containers/${containerId}?confirm=true`, { method: 'DELETE' });
  }

  getImages(): Promise<ImageSummary[]> {
    return this.request<ImageSummary[]>('/api/v1/images');
  }

  pullImage(payload: PullImagePayload): Promise<TaskResponse> {
    return this.request<TaskResponse>('/api/v1/images/pull', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  deleteImage(image: string): Promise<void> {
    return this.request<void>(`/api/v1/images/${encodeURIComponent(image)}?confirm=true`, {
      method: 'DELETE',
    });
  }

  getStacks(): Promise<StackSummary[]> {
    return this.request<StackSummary[]>('/api/v1/stacks');
  }

  runStackAction(name: string, action: 'up' | 'down' | 'restart' | 'pull'): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/api/v1/stacks/${name}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ force_recreate: false, confirm: false }),
    });
  }

  getTasks(): Promise<TaskRecord[]> {
    return this.request<TaskRecord[]>('/api/v1/tasks');
  }

  getTask(taskId: string): Promise<TaskRecord> {
    return this.request<TaskRecord>(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  retryTask(taskId: string): Promise<RetryTaskResponse> {
    return this.request<RetryTaskResponse>(`/api/v1/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
    });
  }

  async downloadTaskFile(taskId: string): Promise<DownloadTaskFileResult> {
    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}/download`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      const message = extractErrorMessage(text);
      throw new Error(message || `Request failed: ${response.status ?? ''}`);
    }

    const blob = await response.blob();
    const filename =
      filenameFromContentDisposition(response.headers.get('content-disposition')) ?? `task-${taskId}`;
    return { filename, blob };
  }

  getTaskLogs(taskId: string, tail = 200): Promise<string> {
    const query = new URLSearchParams({ tail: String(tail) });
    return this.requestText(`/api/v1/tasks/${encodeURIComponent(taskId)}/logs?${query.toString()}`, { method: 'GET' });
  }

  getAuditLogs(): Promise<AuditLogRecord[]> {
    return this.request<AuditLogRecord[]>('/api/v1/audit-logs');
  }

  gitClone(payload: GitClonePayload): Promise<TaskResponse> {
    return this.request<TaskResponse>('/api/v1/images/git/clone', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getWorkspace(workspaceId: string): Promise<WorkspaceInfo> {
    return this.request<WorkspaceInfo>(`/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}`);
  }

  getWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.request<WorkspaceSummary[]>('/api/v1/images/git/workspaces');
  }

  getWorkspaceCompose(
    workspaceId: string,
    composePath?: string,
    source: ComposeSource = 'repository',
  ): Promise<WorkspaceComposeInfo> {
    const query = new URLSearchParams({ source });
    if (composePath) {
      query.set('compose_path', composePath);
    }
    return this.request<WorkspaceComposeInfo>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/compose?${query.toString()}`,
    );
  }

  saveWorkspaceCompose(
    workspaceId: string,
    payload: WorkspaceComposeUpdatePayload,
  ): Promise<WorkspaceComposeUpdateResult> {
    return this.request<WorkspaceComposeUpdateResult>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/compose`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
  }

  clearWorkspaceCompose(workspaceId: string, composePath?: string): Promise<WorkspaceComposeClearResult> {
    const query = new URLSearchParams();
    if (composePath) {
      query.set('compose_path', composePath);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<WorkspaceComposeClearResult>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/compose${suffix}`,
      { method: 'DELETE' },
    );
  }

  runWorkspaceComposeAction(
    workspaceId: string,
    action: 'up' | 'down' | 'restart' | 'pull',
    payload: WorkspaceComposeActionPayload,
  ): Promise<TaskResponse> {
    return this.request<TaskResponse>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/compose/${action}`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  syncWorkspace(workspaceId: string): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/sync`, {
      method: 'POST',
    });
  }

  buildFromWorkspace(workspaceId: string, payload: BuildFromWorkspacePayload): Promise<TaskResponse> {
    return this.request<TaskResponse>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/build`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  getWorkspaceEnv(workspaceId: string, templatePath?: string): Promise<WorkspaceEnvInfo> {
    const query = new URLSearchParams();
    if (templatePath) {
      query.set('template_path', templatePath);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<WorkspaceEnvInfo>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/env${suffix}`,
    );
  }

  saveWorkspaceEnv(workspaceId: string, payload: WorkspaceEnvUpdatePayload): Promise<{ workspace_id: string; template_path: string; target_path: string }> {
    return this.request(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/env`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
  }

  clearWorkspaceEnv(workspaceId: string, templatePath: string): Promise<{ deleted: boolean }> {
    const query = new URLSearchParams({ template_path: templatePath });
    return this.request(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/env?${query.toString()}`,
      { method: 'DELETE' },
    );
  }

  saveWorkspaceProjectName(
    workspaceId: string,
    payload: WorkspaceProjectNamePayload,
  ): Promise<{ workspace_id: string; compose_path: string; project_name: string }> {
    return this.request(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/project-name`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
  }

  saveWorkspaceImageTags(
    workspaceId: string,
    payload: WorkspaceImageTagsPayload,
  ): Promise<WorkspaceComposeUpdateResult> {
    return this.request<WorkspaceComposeUpdateResult>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/compose/image-tags`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
  }

  deleteWorkspace(workspaceId: string): Promise<void> {
    return this.request<void>(`/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}?confirm=true`, {
      method: 'DELETE',
    });
  }

  loadFromUrl(payload: LoadFromUrlPayload): Promise<TaskResponse> {
    return this.request<TaskResponse>('/api/v1/images/load-url', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getProxyConfig(): Promise<ProxyConfig> {
    return this.request<ProxyConfig>('/api/v1/system/proxy', { method: 'GET' });
  }

  updateProxyConfig(payload: UpdateProxyPayload): Promise<ProxyConfig> {
    return this.request<ProxyConfig>('/api/v1/system/proxy', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
}
