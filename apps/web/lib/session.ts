const ACCESS_TOKEN_KEY = 'jarvis_access_token';
const REFRESH_TOKEN_KEY = 'jarvis_refresh_token';

export interface SessionState {
  accessToken: string;
  refreshToken: string;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function saveSession(session: SessionState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
}

export function loadSession(): SessionState {
  if (!isBrowser()) return { accessToken: '', refreshToken: '' };
  return {
    accessToken: window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '',
    refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY) ?? '',
  };
}

export function clearSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
