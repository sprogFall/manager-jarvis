'use client';

import { useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    if (!session.accessToken) {
      window.location.replace('/login');
    }
  }, [session.accessToken]);

  function handleLogout() {
    clearSession();
    setSession(loadSession());
  }

  if (!session.accessToken) {
    return (
      <main className="login-layout">
        <p className="muted">正在跳转到登录页...</p>
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <AppShell client={client} onLogout={handleLogout} />
    </main>
  );
}
