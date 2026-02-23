import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockLocationReplace = vi.fn();

Object.defineProperty(window, 'location', {
  value: { ...window.location, replace: mockLocationReplace },
  writable: true,
});

vi.mock('@/lib/session', () => ({
  loadSession: () => ({ accessToken: '', refreshToken: '' }),
  clearSession: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  ApiClient: class {},
  apiBaseUrl: () => 'http://localhost:8000',
}));

import DashboardPage from '@/app/dashboard/page';

describe('DashboardPage', () => {
  beforeEach(() => {
    mockLocationReplace.mockClear();
  });

  it('redirects to login when no session token', () => {
    render(<DashboardPage />);
    expect(mockLocationReplace).toHaveBeenCalledWith('/login');
    expect(screen.getByText('正在跳转到登录页...')).toBeInTheDocument();
  });
});
