import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppShell } from '@/components/app-shell';

describe('AppShell', () => {
  it('switches active section from sidebar and mobile menu', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(screen.getAllByText('容器总览').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '镜像' }));
    expect(screen.getAllByText('镜像管理').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '打开导航' }));
    await user.click(screen.getByRole('button', { name: '任务' }));
    expect(screen.getAllByText('任务中心').length).toBeGreaterThan(0);
  });
});
