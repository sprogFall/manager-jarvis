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
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('throws response text on request failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      text: async () => 'bad request',
    });

    const client = new ApiClient('http://localhost:8000', 'token-123');
    await expect(client.getImages()).rejects.toThrow('bad request');
  });
});
