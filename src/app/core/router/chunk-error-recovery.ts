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
 * which fetches the fresh index.html + chunk map and completes the navigation
 * the user asked for. A short session-scoped guard prevents a genuinely broken
 * deploy from reload-looping.
 */

const CHUNK_ERROR_PATTERNS: readonly RegExp[] = [
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
];

/** True when the error is a failed lazy-chunk / dynamic-import fetch. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  if ((error as { name?: string }).name === 'ChunkLoadError') return true;
  const message = (error as { message?: string }).message ?? String(error);
  return CHUNK_ERROR_PATTERNS.some(re => re.test(message));
}

const RELOAD_GUARD_PREFIX = 'chunk-reload:';
/** Suppress a second reload for the same URL within this window (broken deploy). */
const RELOAD_GUARD_MS = 10_000;

/**
 * If the navigation failed on a stale chunk, reload the attempted URL and
 * return true. Otherwise return false and let the error propagate.
 *
 * Injectable seams (`win`, `now`) keep it unit-testable and SSR-safe — callers
 * only invoke it in the browser.
 */
export function recoverFromChunkError(
  event: NavigationError,
  win: Window = window,
  now: number = Date.now(),
): boolean {
  if (!isChunkLoadError(event.error)) return false;

  const url = event.url || win.location.pathname;
  const key = RELOAD_GUARD_PREFIX + url;
  try {
    const last = Number(win.sessionStorage.getItem(key));
    if (last && now - last < RELOAD_GUARD_MS) {
      // Already reloaded for this URL moments ago and it still fails — a truly
      // broken deploy, not a stale tab. Stop so the error surfaces instead of
      // looping. Clear the marker so a later, unrelated deploy can recover.
      win.sessionStorage.removeItem(key);
      return false;
    }
    win.sessionStorage.setItem(key, String(now));
  } catch {
    // sessionStorage unavailable (private mode) — reload once anyway.
  }

  win.location.assign(url);
  return true;
}
