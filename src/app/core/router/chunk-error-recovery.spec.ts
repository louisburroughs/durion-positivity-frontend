import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavigationError } from '@angular/router';
import { isChunkLoadError, recoverFromChunkError } from './chunk-error-recovery';

const navError = (error: unknown, url = '/app/billing'): NavigationError =>
  new NavigationError(1, url, error);

function fakeWindow() {
  const store = new Map<string, string>();
  return {
    location: { pathname: '/app', assign: vi.fn() },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  } as unknown as Window;
}

describe('isChunkLoadError', () => {
  it('matches the dynamic-import failures each browser emits', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError' })).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /chunk-ABC.js'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true);
  });

  it('ignores unrelated navigation errors and nullish input', () => {
    expect(isChunkLoadError(new Error('Cannot match any routes'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('recoverFromChunkError', () => {
  let win: Window;
  beforeEach(() => { win = fakeWindow(); });

  it('reloads the attempted URL on a stale-chunk failure', () => {
    const handled = recoverFromChunkError(
      navError(new Error('Failed to fetch dynamically imported module'), '/app/people'),
      win, 1000,
    );
    expect(handled).toBe(true);
    expect(win.location.assign).toHaveBeenCalledWith('/app/people');
  });

  it('does not reload for a non-chunk navigation error', () => {
    const handled = recoverFromChunkError(navError(new Error('Cannot match any routes')), win, 1000);
    expect(handled).toBe(false);
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('suppresses a second reload for the same URL within the guard window', () => {
    const err = navError(new Error('ChunkLoadError'), '/app/location');
    expect(recoverFromChunkError(err, win, 1000)).toBe(true);
    // Same URL failing again 3s later → broken deploy, do not loop.
    expect(recoverFromChunkError(err, win, 4000)).toBe(false);
    expect(win.location.assign).toHaveBeenCalledTimes(1);
  });

  it('recovers again for the same URL after the guard window elapses (later deploy)', () => {
    const err = navError(new Error('ChunkLoadError'), '/app/location');
    expect(recoverFromChunkError(err, win, 1000)).toBe(true);
    expect(recoverFromChunkError(err, win, 1000 + 20_000)).toBe(true);
    expect(win.location.assign).toHaveBeenCalledTimes(2);
  });

  it('falls back to the current pathname when the event URL is empty', () => {
    const handled = recoverFromChunkError(navError(new Error('ChunkLoadError'), ''), win, 1000);
    expect(handled).toBe(true);
    expect(win.location.assign).toHaveBeenCalledWith('/app');
  });
});
