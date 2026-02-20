'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { ApiClient, apiBaseUrl } from '@/lib/api';
import { clearSession, loadSession } from '@/lib/session';

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState(loadSession());

  const client = useMemo(() => {
    if (!session.accessToken) {
      return undefined;
    }
    return new ApiClient(apiBaseUrl(), session.accessToken);
  }, [session.accessToken]);

  useEffect(() => {
    if (!session.accessToken) {
      router.replace('/login');
    }
  }, [session.accessToken, router]);

  function handleLogout() {
    clearSession();
    setSession(loadSession());
  }

  if (!session.accessToken) {
    return null;
  }

  return (
    <main className="dashboard-layout">
      <AppShell client={client} onLogout={handleLogout} />
    </main>
  );
}
