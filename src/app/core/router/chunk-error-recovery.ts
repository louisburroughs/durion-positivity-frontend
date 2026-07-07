import { NavigationError } from '@angular/router';

/**
 * Recovery for stale-tab chunk-load failures after a deploy.
 *
 * Domain modules under /app are lazy-loaded as content-hashed chunks. A deploy
 * replaces those files, so a tab opened before the deploy holds an outdated
 * chunk map: navigating to a not-yet-visited module requests an old chunk
 * filename that now 404s, the dynamic import rejects, and the router silently
 * aborts the navigation — the click appears to do nothing.
 *
 * We detect that specific failure and do a full-page load of the attempted URL,
 * which fetches the fresh index.html + chunk map and completes the navigation.
 *
 * Loop safety is the hard part (a genuinely broken deploy must not reload
 * forever), so the guard is **count-based, not time-based** — a wall-clock
 * window can be exceeded by a slow re-bootstrap and defeat itself. The budget
 * is persisted in sessionStorage (the only state that survives a reload) and
 * is reset by `clearChunkReloadGuard()` on the first successful navigation
 * after each load, which proves the tab is healthy. If sessionStorage is
 * unavailable we cannot prevent a loop, so we fail safe and do NOT reload.
 */

const CHUNK_ERROR_PATTERNS: readonly RegExp[] = [
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
];

const MAX_CAUSE_DEPTH = 4;

/** True when the error (or a wrapped `cause`) is a failed lazy-chunk fetch. */
export function isChunkLoadError(error: unknown, depth = 0): boolean {
  if (!error || depth > MAX_CAUSE_DEPTH) return false;
  if ((error as { name?: string }).name === 'ChunkLoadError') return true;
  const message = (error as { message?: string }).message ?? String(error);
  if (CHUNK_ERROR_PATTERNS.some(re => re.test(message))) return true;
  // Bundlers/Angular may wrap the underlying fetch failure as `error.cause`.
  return isChunkLoadError((error as { cause?: unknown }).cause, depth + 1);
}

const GUARD_KEY = 'chunk-reload-guard';
/** Cap total recovery reloads between healthy navigations (systemic-break backstop). */
const MAX_RELOADS = 3;

interface ReloadGuard {
  /** Total recovery reloads since the last healthy navigation. */
  n: number;
  /** URLs already reloaded once — never reload the same route twice in a row. */
  urls: string[];
}

function readGuard(storage: Storage): ReloadGuard {
  try {
    const raw = storage.getItem(GUARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReloadGuard>;
      return { n: parsed.n ?? 0, urls: Array.isArray(parsed.urls) ? parsed.urls : [] };
    }
  } catch {
    // fall through
  }
  return { n: 0, urls: [] };
}

/**
 * If the navigation failed on a stale chunk, reload the attempted URL and
 * return true. Otherwise (or if we can't safely guard against a loop) return
 * false and let the error propagate.
 *
 * `win` is injectable for tests and SSR-safety — callers invoke it in the
 * browser only.
 */
export function recoverFromChunkError(event: NavigationError, win: Window = window): boolean {
  if (!isChunkLoadError(event.error)) return false;

  const url = event.url || win.location.pathname;

  // Persistence is mandatory: without it we can't tell a first attempt from a
  // loop, so failing safe (no reload) beats reloading forever.
  let storage: Storage;
  try {
    storage = win.sessionStorage;
    const guard = readGuard(storage);
    if (guard.n >= MAX_RELOADS || guard.urls.includes(url)) {
      return false; // budget spent, or already reloaded this route once — stop.
    }
    storage.setItem(GUARD_KEY, JSON.stringify({ n: guard.n + 1, urls: [...guard.urls, url] }));
  } catch {
    return false; // sessionStorage blocked/full — cannot guard a loop, so don't reload.
  }

  win.location.assign(url);
  return true;
}

/**
 * Reset the reload budget. Call on the first successful navigation after a page
 * load: reaching it proves the tab is healthy, so any future stale-chunk click
 * gets a fresh recovery attempt.
 */
export function clearChunkReloadGuard(win: Window = window): void {
  try {
    win.sessionStorage.removeItem(GUARD_KEY);
  } catch {
    // nothing to clear
  }
}
