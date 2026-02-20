import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContainerPanel } from '@/components/panels/container-panel';
import type { ContainerDetail, ContainerSummary } from '@/lib/types';

const containers: ContainerSummary[] = [
  {
    id: 'c1',
    name: 'web',
    image: 'nginx:latest',
    status: 'running',
    state: 'Up 2 minutes',
    ports: ['0.0.0.0:8080->80/tcp'],
    stats: { cpu_percent: 2.1, memory_usage: 10, memory_limit: 100, memory_percent: 10 },
  },
];

const detail: ContainerDetail = {
  id: 'c1',
  name: 'web',
  image: 'nginx:latest',
  status: 'running',
  state: 'running',
  command: 'nginx -g "daemon off;"',
  created: '2026-02-20T01:02:03Z',
  env: ['A=1', 'B=2'],
  mounts: [{ Source: '/host/data', Destination: '/data' }],
  networks: { bridge: { IPAddress: '172.17.0.2' } },
  ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] },
  stats: null,
};

describe('ContainerPanel', () => {
  it('shows prominent loading feedback while waiting data', async () => {
    let resolveLoad: (value: ContainerSummary[]) => void = () => undefined;
    const loadContainers = vi.fn().mockImplementation(
      () =>
        new Promise<ContainerSummary[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    render(
      <ContainerPanel
        loadContainers={loadContainers}
        loadContainerDetail={vi.fn().mockResolvedValue(detail)}
        actionContainer={vi.fn().mockResolvedValue(undefined)}
        removeContainer={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('正在加载容器列表...')).toBeInTheDocument();

    resolveLoad(containers);

    expect(await screen.findByText('web')).toBeInTheDocument();
  });

  it('loads containers and fires action', async () => {
    const user = userEvent.setup();
    const loadContainers = vi.fn().mockResolvedValue(containers);
    const actionContainer = vi.fn().mockResolvedValue(undefined);

    render(
      <ContainerPanel
        loadContainers={loadContainers}
        loadContainerDetail={vi.fn().mockResolvedValue(detail)}
        actionContainer={actionContainer}
        removeContainer={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText('web')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重启 web' }));

    await waitFor(() => {
      expect(actionContainer).toHaveBeenCalledWith('c1', 'restart');
    });
  });

  it('displays Chinese status and friendly port format', async () => {
    render(
      <ContainerPanel
        loadContainers={vi.fn().mockResolvedValue(containers)}
        loadContainerDetail={vi.fn().mockResolvedValue(detail)}
        actionContainer={vi.fn().mockResolvedValue(undefined)}
        removeContainer={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('宿主机 8080 → 容器 80/tcp')).toBeInTheDocument();
  });

  it('loads detail on demand', async () => {
    const user = userEvent.setup();
    const loadContainerDetail = vi.fn().mockResolvedValue(detail);

    render(
      <ContainerPanel
        loadContainers={vi.fn().mockResolvedValue(containers)}
        loadContainerDetail={loadContainerDetail}
        actionContainer={vi.fn().mockResolvedValue(undefined)}
        removeContainer={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText('web')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看 web 详情' }));

    await waitFor(() => {
      expect(loadContainerDetail).toHaveBeenCalledWith('c1');
    });
    expect(await screen.findByText('容器详情')).toBeInTheDocument();
    expect(screen.getByText('nginx -g "daemon off;"')).toBeInTheDocument();
  });
});
