import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavigationError } from '@angular/router';
import { isChunkLoadError, recoverFromChunkError, clearChunkReloadGuard } from './chunk-error-recovery';

const navError = (error: unknown, url = '/app/billing'): NavigationError =>
  new NavigationError(1, url, error);

function fakeWindow(opts: { throwStorage?: boolean } = {}) {
  const store = new Map<string, string>();
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  const working = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return {
    location: { pathname: '/app', assign: vi.fn() },
    sessionStorage: opts.throwStorage ? throwing : working,
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

  it('walks a wrapped error.cause', () => {
    const wrapped = new Error('Unable to load route', {
      cause: new Error('Failed to fetch dynamically imported module: /chunk-ABC.js'),
    });
    expect(isChunkLoadError(wrapped)).toBe(true);
  });

  it('ignores unrelated errors, nullish input, and deep non-matching cause chains', () => {
    expect(isChunkLoadError(new Error('Cannot match any routes'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    const deep = new Error('a', { cause: new Error('b', { cause: new Error('c') }) });
    expect(isChunkLoadError(deep)).toBe(false);
  });
});

describe('recoverFromChunkError', () => {
  let win: Window;
  beforeEach(() => { win = fakeWindow(); });

  it('reloads the attempted URL on a stale-chunk failure', () => {
    const handled = recoverFromChunkError(
      navError(new Error('Failed to fetch dynamically imported module'), '/app/people'), win,
    );
    expect(handled).toBe(true);
    expect(win.location.assign).toHaveBeenCalledWith('/app/people');
  });

  it('does not reload for a non-chunk navigation error', () => {
    const handled = recoverFromChunkError(navError(new Error('Cannot match any routes')), win);
    expect(handled).toBe(false);
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it('never reloads the same URL twice (broken-deploy loop protection)', () => {
    const err = navError(new Error('ChunkLoadError'), '/app/location');
    expect(recoverFromChunkError(err, win)).toBe(true);
    // Simulates the post-reload re-bootstrap failing on the same URL — must stop
    // regardless of how long the reload took (count-based, not time-based).
    expect(recoverFromChunkError(err, win)).toBe(false);
    expect(win.location.assign).toHaveBeenCalledTimes(1);
  });

  it('caps total reloads across distinct URLs (systemic shared-chunk break)', () => {
    for (const path of ['/a', '/b', '/c', '/d', '/e']) {
      recoverFromChunkError(navError(new Error('ChunkLoadError'), path), win);
    }
    expect(win.location.assign).toHaveBeenCalledTimes(3); // MAX_RELOADS
  });

  it('fails safe (no reload) when sessionStorage is unavailable — cannot guard a loop', () => {
    const blocked = fakeWindow({ throwStorage: true });
    const handled = recoverFromChunkError(navError(new Error('ChunkLoadError')), blocked);
    expect(handled).toBe(false);
    expect(blocked.location.assign).not.toHaveBeenCalled();
  });

  it('allows a fresh recovery after the guard is cleared (healthy navigation)', () => {
    const err = navError(new Error('ChunkLoadError'), '/app/location');
    expect(recoverFromChunkError(err, win)).toBe(true);
    clearChunkReloadGuard(win);
    expect(recoverFromChunkError(err, win)).toBe(true);
    expect(win.location.assign).toHaveBeenCalledTimes(2);
  });

  it('falls back to the current pathname when the event URL is empty', () => {
    const handled = recoverFromChunkError(navError(new Error('ChunkLoadError'), ''), win);
    expect(handled).toBe(true);
    expect(win.location.assign).toHaveBeenCalledWith('/app');
  });
});

describe('clearChunkReloadGuard', () => {
  it('does not throw when sessionStorage is unavailable', () => {
    expect(() => clearChunkReloadGuard(fakeWindow({ throwStorage: true }))).not.toThrow();
  });
});
