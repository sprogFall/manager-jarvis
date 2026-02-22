import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '@/lib/api';

describe('ApiClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('adds bearer token when calling protected endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
      text: async () => '',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await client.getContainers();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/api/v1/containers?include_stats=false');
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('requests container detail by id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'c1',
        name: 'web',
        image: 'nginx:latest',
        status: 'running',
        state: 'running',
        command: 'nginx -g "daemon off;"',
        created: '2026-02-20T01:02:03Z',
        env: ['A=1'],
        mounts: [],
        networks: {},
        ports: {},
      }),
      text: async () => '',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    const result = await client.getContainerDetail('c1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/containers/c1',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(result.id).toBe('c1');
  });

  it('requests task logs as text', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => 'line-1\\nline-2\\n',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    const logs = await client.getTaskLogs('task-1', 500);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tasks/task-1/logs?tail=500',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(logs).toBe('line-1\\nline-2\\n');
  });

  it('requests workspace list', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
      text: async () => '',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await client.getWorkspaces();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/images/git/workspaces',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('deletes workspace with secondary confirmation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await client.deleteWorkspace('a'.repeat(32));

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1/images/git/workspace/${'a'.repeat(32)}?confirm=true`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('retries failed task', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ original_task_id: 'task-1', new_task_id: 'task-2' }),
      text: async () => '',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    const result = await client.retryTask('task-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tasks/task-1/retry',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.new_task_id).toBe('task-2');
  });

  it('downloads task file with bearer token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-disposition': 'attachment; filename=\"logs.txt\"' }),
      blob: async () => new Blob(['hello']),
      text: async () => '',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    const result = await client.downloadTaskFile('task-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/api/v1/tasks/task-1/download');
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(result.filename).toBe('logs.txt');
  });

  it('requests and updates proxy config', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proxy_url: 'http://127.0.0.1:7890' }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proxy_url: 'http://127.0.0.1:7891' }),
        text: async () => '',
      });

    const client = new ApiClient('http://localhost:8000', 'token-123');

    await client.getProxyConfig();
    await client.updateProxyConfig({ proxy_url: 'http://127.0.0.1:7891' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/system/proxy',
      expect.objectContaining({ method: 'GET' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/system/proxy',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ proxy_url: 'http://127.0.0.1:7891' }),
      }),
    );
  });

  it('handles workspace compose workflow endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspace_id: 'ws-1',
          compose_files: ['compose.yaml'],
          selected_compose: 'compose.yaml',
          source: 'repository',
          custom_exists: false,
          project_name: 'ws-demo',
          content: 'services: {}',
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspace_id: 'ws-1',
          compose_path: 'compose.yaml',
          custom_compose_path: '.jarvis/compose-overrides/1.yaml',
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: 'task-compose-up' }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: 'task-sync' }),
        text: async () => '',
      });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await client.getWorkspaceCompose('ws-1', 'compose.yaml', 'custom');
    await client.saveWorkspaceCompose('ws-1', { compose_path: 'compose.yaml', content: 'services:\n  web: {}' });
    await client.runWorkspaceComposeAction('ws-1', 'up', { compose_path: 'compose.yaml', source: 'custom' });
    await client.syncWorkspace('ws-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/images/git/workspace/ws-1/compose?source=custom&compose_path=compose.yaml',
      expect.objectContaining({ cache: 'no-store' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/images/git/workspace/ws-1/compose',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ compose_path: 'compose.yaml', content: 'services:\n  web: {}' }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8000/api/v1/images/git/workspace/ws-1/compose/up',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ compose_path: 'compose.yaml', source: 'custom' }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:8000/api/v1/images/git/workspace/ws-1/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws response text on request failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      text: async () => 'bad request',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await expect(client.getImages()).rejects.toThrow('bad request');
  });

  it('extracts FastAPI detail message on request failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: 'Task not found' }),
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await expect(client.getTask('missing')).rejects.toMatchObject({ message: 'Task not found' });
  });
});
