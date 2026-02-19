'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { ApiClient, apiBaseUrl } from '@/lib/api';
import { clearSession, loadSession } from '@/lib/session';

export default function DashboardPage() {
  const [session, setSession] = useState(loadSession());

  const client = useMemo(() => {
    if (!session.accessToken) {
      return undefined;
    }
    return new ApiClient(apiBaseUrl(), session.accessToken);
  }, [session.accessToken]);

  function handleLogout() {
    clearSession();
    setSession(loadSession());
  }

  if (!session.accessToken) {
    return (
      <main className="unauthorized">
        <div className="unauthorized-card">
          <h1>尚未登录</h1>
          <p>请先进入登录页获取访问令牌，再使用 Docker 管理功能。</p>
          <Link href="/login">前往登录</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <AppShell client={client} onLogout={handleLogout} />
    </main>
  );
}
