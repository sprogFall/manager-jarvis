import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

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
    mockReplace.mockClear();
  });

  it('redirects to login when no session token', () => {
    render(<DashboardPage />);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
