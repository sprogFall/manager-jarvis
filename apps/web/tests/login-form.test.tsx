import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/login-form';

describe('LoginForm', () => {
  it('submits username and password', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<LoginForm onSubmit={onSubmit} loading={false} error="" />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), 'admin123456');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onSubmit).toHaveBeenCalledWith({ username: 'admin', password: 'admin123456' });
  });

  it('shows api error text', () => {
    render(<LoginForm onSubmit={vi.fn()} loading={false} error="认证失败" />);
    expect(screen.getByText('认证失败')).toBeInTheDocument();
  });
});
