import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/app-shell';

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    })),
  );

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches, media: '(max-width: 960px)' } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.classList.remove('mobile-nav-open');
});

describe('AppShell', () => {
  it('switches active section from sidebar and mobile menu', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();

    render(<AppShell />);

    expect(screen.getAllByText('容器总览').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '镜像' }));
    expect(screen.getAllByText('镜像管理').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '打开导航' }));
    await user.click(screen.getByRole('button', { name: '任务' }));
    expect(screen.getAllByText('任务中心').length).toBeGreaterThan(0);
  });

  it('closes mobile sidebar when switching to desktop viewport', async () => {
    const media = stubMatchMedia(true);
    const user = userEvent.setup();

    render(<AppShell />);

    const sidebar = screen.getByLabelText('侧边导航');
    await user.click(screen.getByRole('button', { name: '打开导航' }));
    expect(sidebar.className).toContain('open');

    media.setMatches(false);
    await waitFor(() => {
      expect(sidebar.className).not.toContain('open');
      expect(document.body.classList.contains('mobile-nav-open')).toBe(false);
    });
  });

  it('locks page scroll when mobile sidebar opens and unlocks after close', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();

    render(<AppShell />);

    await user.click(screen.getByRole('button', { name: '打开导航' }));
    expect(document.body.classList.contains('mobile-nav-open')).toBe(true);

    await user.click(screen.getByRole('button', { name: '关闭侧边导航' }));
    await waitFor(() => {
      expect(document.body.classList.contains('mobile-nav-open')).toBe(false);
    });
  });
});
