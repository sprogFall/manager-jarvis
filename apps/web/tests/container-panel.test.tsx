import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContainerPanel } from '@/components/panels/container-panel';
import type { ContainerSummary } from '@/lib/types';

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
});
