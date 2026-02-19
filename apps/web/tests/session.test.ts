import { describe, expect, it, beforeEach } from 'vitest';

import { clearSession, loadSession, saveSession } from '@/lib/session';

describe('session helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads tokens', () => {
    saveSession({ accessToken: 'acc', refreshToken: 'ref' });
    expect(loadSession()).toEqual({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('clears tokens', () => {
    saveSession({ accessToken: 'acc', refreshToken: 'ref' });
    clearSession();
    expect(loadSession()).toEqual({ accessToken: '', refreshToken: '' });
  });
});
