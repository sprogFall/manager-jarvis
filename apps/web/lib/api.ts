import type {
  AuditLogRecord,
  BuildFromWorkspacePayload,
  ContainerSummary,
  GitClonePayload,
  ImageSummary,
  LoadFromUrlPayload,
  LoginPayload,
  PullImagePayload,
  StackSummary,
  TaskRecord,
  TaskResponse,
  TokenResponse,
  WorkspaceInfo,
} from '@/lib/types';

function trimSlash(value: string): string {
  return value.replace(/\/$/, '');
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
      throw new Error(text || `Request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
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
    return this.request<ContainerSummary[]>('/api/v1/containers');
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

  buildFromWorkspace(workspaceId: string, payload: BuildFromWorkspacePayload): Promise<TaskResponse> {
    return this.request<TaskResponse>(
      `/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}/build`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  deleteWorkspace(workspaceId: string): Promise<void> {
    return this.request<void>(`/api/v1/images/git/workspace/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    });
  }

  loadFromUrl(payload: LoadFromUrlPayload): Promise<TaskResponse> {
    return this.request<TaskResponse>('/api/v1/images/load-url', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
}
