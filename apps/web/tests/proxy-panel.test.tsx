import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProxyPanel } from '@/components/panels/proxy-panel';

describe('ProxyPanel', () => {
  it('loads current proxy value and submits update', async () => {
    const user = userEvent.setup();
    const loadProxy = vi.fn().mockResolvedValue({ proxy_url: 'http://127.0.0.1:7890' });
    const updateProxy = vi.fn().mockResolvedValue({ proxy_url: 'http://127.0.0.1:7891' });

    render(<ProxyPanel loadProxy={loadProxy} updateProxy={updateProxy} />);

    expect(await screen.findByDisplayValue('http://127.0.0.1:7890')).toBeInTheDocument();

    const input = screen.getByLabelText('代理服务器地址');
    await user.clear(input);
    await user.type(input, 'http://127.0.0.1:7891');
    await user.click(screen.getByRole('button', { name: '保存代理配置' }));

    await waitFor(() => {
      expect(updateProxy).toHaveBeenCalledWith({ proxy_url: 'http://127.0.0.1:7891' });
    });
  });

  it('submits null when clearing proxy', async () => {
    const user = userEvent.setup();
    const loadProxy = vi.fn().mockResolvedValue({ proxy_url: 'http://127.0.0.1:7890' });
    const updateProxy = vi.fn().mockResolvedValue({ proxy_url: null });

    render(<ProxyPanel loadProxy={loadProxy} updateProxy={updateProxy} />);

    const input = await screen.findByLabelText('代理服务器地址');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: '保存代理配置' }));

    await waitFor(() => {
      expect(updateProxy).toHaveBeenCalledWith({ proxy_url: null });
    });
  });
});
