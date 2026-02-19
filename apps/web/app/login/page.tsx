'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LoginForm } from '@/components/login-form';
import { ApiClient, apiBaseUrl } from '@/lib/api';
import { saveSession } from '@/lib/session';
import type { LoginPayload } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(payload: LoginPayload) {
    setLoading(true);
    setError('');
    try {
      const result = await ApiClient.login(apiBaseUrl(), payload);
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token });
      router.push('/dashboard');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-layout">
      <div className="backdrop" />
      <LoginForm onSubmit={submit} loading={loading} error={error} />
      <p className="login-hint">
        默认账号可在后端 `.env` 中配置。返回 <Link href="/dashboard">仪表盘</Link>
      </p>
    </main>
  );
}
