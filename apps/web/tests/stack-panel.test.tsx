import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StackPanel } from '@/components/panels/stack-panel';
import type { StackSummary } from '@/lib/types';

const stacks: StackSummary[] = [
  {
    name: 'demo',
    path: '/data/stacks/demo',
    compose_file: '/data/stacks/demo/compose.yaml',
    services: [{ Service: 'web', State: 'running' }],
  },
];

describe('StackPanel', () => {
  it('loads stacks and triggers up action', async () => {
    const user = userEvent.setup();
    const loadStacks = vi.fn().mockResolvedValue(stacks);
    const runStackAction = vi.fn().mockResolvedValue({ task_id: 'task-up' });

    render(<StackPanel loadStacks={loadStacks} runStackAction={runStackAction} />);

    expect(await screen.findByText('demo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '启动 demo' }));

    await waitFor(() => {
      expect(runStackAction).toHaveBeenCalledWith('demo', 'up');
    });
  });
});
