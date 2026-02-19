'use client';

import { FormEvent, useState } from 'react';

import type { LoginPayload } from '@/lib/types';

interface LoginFormProps {
  onSubmit: (payload: LoginPayload) => Promise<void>;
  loading: boolean;
  error: string;
}

export function LoginForm({ onSubmit, loading, error }: LoginFormProps) {
  const [form, setForm] = useState<LoginPayload>({ username: '', password: '' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(form);
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-head">
        <span className="topbar-chip">管理控制台</span>
        <h1>Manager Jarvis</h1>
        <p className="muted">统一管理容器、镜像、Compose 栈与异步任务</p>
      </div>

      <label>
        用户名
        <input
          aria-label="用户名"
          autoComplete="username"
          value={form.username}
          onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
          placeholder="admin"
        />
      </label>

      <label>
        密码
        <input
          aria-label="密码"
          autoComplete="current-password"
          type="password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          placeholder="请输入密码"
        />
      </label>

      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn" disabled={loading}>
        {loading ? '登录中...' : '登录'}
      </button>
    </form>
  );
}
