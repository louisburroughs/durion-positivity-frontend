import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, throwError } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AuthService } from '../../../core/services/auth.service';
import { identityKey } from '../util/identity.util';

/** A URL carrying a scheme (`https:`, `mailto:`) points somewhere we do not authenticate to. */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * ChatBlobService
 * ---------------
 * Resolves a URL from an assistant answer into something an `<img>` or a
 * download can actually use.
 *
 * A native `<img src>` or `<a href>` is fetched by the browser, not by
 * `HttpClient`, so `authInterceptor` never sees it and no bearer token is
 * attached. Any same-origin API path in an answer — the typed-block contract
 * describes `/mcp-server/v1/mcp/blobs/<id>` — would therefore render as a broken
 * image or a 401 download in a signed-in session.
 *
 * So: a relative URL is fetched through {@link ApiBaseService} and handed back as
 * an object URL; an absolute one is already public and is returned unchanged.
 *
 * The cache is keyed by TENANT + SUBJECT as well as by the source URL, and is
 * emptied when that identity changes: the same `/blobs/7` path means a different
 * document under a different tenant, and this service is root-scoped, so a
 * cached object URL would otherwise outlive the session it was fetched for and
 * show the previous tenant's document without a new authenticated request
 * (ADR-0062, ADR-0065 §4/§5).
 *
 * This service OWNS every object URL it mints. Consumers never revoke one: the
 * same URL is handed to the `<img>` renderer and to repeated downloads of the
 * same file, so revoking it at one consumer breaks the others. They are revoked
 * here, on an identity change and on destroy.
 */
@Injectable({ providedIn: 'root' })
export class ChatBlobService {
  private readonly api = inject(ApiBaseService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** Keyed by `${identity}|${url}` — never by the URL alone. */
  private readonly inFlight = new Map<string, Observable<string>>();
  private readonly objectUrls = new Set<string>();

  /**
   * Plain field, not a signal: the effect below compares against it, and seeding
   * it from the current claims keeps the effect's first run from being read as a
   * change of identity.
   */
  private trackedIdentity = identityKey(this.auth.currentUserClaims());

  constructor() {
    effect(() => {
      const identity = identityKey(this.auth.currentUserClaims());
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      // Nothing fetched for the previous session may be handed to this one, and
      // the blobs themselves are the previous tenant's data.
      this.discard();
    });

    this.destroyRef.onDestroy(() => this.discard());
  }

  /** True when the browser would fetch this URL from our own API, unauthenticated. */
  needsAuthentication(url: string): boolean {
    return url.length > 0 && !HAS_SCHEME_RE.test(url);
  }

  /**
   * A URL safe to put in `src`/`href`. Emits once; errors through if the fetch
   * fails, so the caller can show something honest rather than a broken image.
   */
  resolve(url: string): Observable<string> {
    if (!this.needsAuthentication(url)) return of(url);

    // Captured at issue time, so a response that settles after an identity change
    // cannot be filed under — or served to — the new one (ADR-0063 §1).
    const claims = this.auth.currentUserClaims();
    const identity = identityKey(claims);
    const key = cacheKey(identity, url);
    // Caching needs BOTH halves of the identity. A token carrying no `tid` keys as
    // `|sub`, so the same subject in two tenant contexts would share one entry and
    // `/blobs/7` could replay the previous tenant's document — the very collision
    // the key exists to prevent (ADR-0062, ADR-0065 §4/§5). This is the store's
    // `hasStorageSlot()` reasoning: no complete identity, no slot to keep anything
    // in. The fetch still happens, and its object URL is still tracked so it is
    // revoked on destroy and on an identity change; it is simply never replayed.
    const cacheable = hasCompleteIdentity(claims);
    const cached = cacheable ? this.inFlight.get(key) : undefined;
    if (cached) return cached;

    const request = this.api.getBlob(url, { baseUrlOverride: '' }).pipe(
      map(blob => {
        // The bytes arrived for a session that has ended. Emptying the cache on
        // the change does NOT cancel this fetch — `shareReplay({ refCount: false })`
        // keeps the source subscribed — so without this check the callback would
        // still mint an object URL for the previous tenant's document, add it to
        // the set THIS session owns, and replay it to whoever is still subscribed
        // (ADR-0063 §1: the result is matched against the identity it was
        // requested for; §6: a browser resource is created only for that identity;
        // ADR-0062).
        if (identityKey(this.auth.currentUserClaims()) !== identity) {
          throw new ChatBlobIdentityChangedError();
        }
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.add(objectUrl);
        return objectUrl;
      }),
      catchError((error: unknown) => {
        // Do not cache a failure: a token refresh can make the next try succeed —
        // and a result dropped for the wrong identity must leave nothing behind
        // either, under this key or the new identity's (which it never held).
        this.inFlight.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    if (cacheable) this.inFlight.set(key, request);
    return request;
  }

  private discard(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    // Only the ENTRIES go: a fetch already open stays subscribed under
    // `shareReplay({ refCount: false })`, which is why `resolve()` also checks the
    // identity when the bytes arrive.
    this.inFlight.clear();
  }
}

/** Tenant + subject first, so no two identities can share a cache entry. */
function cacheKey(identity: string, url: string): string {
  return `${identity}|${url}`;
}

/**
 * Both halves present. `identityKey` encodes a missing claim as an empty half, so
 * it still produces a usable-looking key for an incomplete token — which is
 * exactly the key two different tenant contexts would collide on.
 */
function hasCompleteIdentity(claims: { tid?: string; sub?: string } | null | undefined): boolean {
  return (claims?.tid?.trim() ?? '').length > 0 && (claims?.sub?.trim() ?? '').length > 0;
}

/**
 * The session that asked for these bytes ended before they arrived, so they are
 * dropped rather than delivered. Carries no user-facing prose: the caller renders
 * its own failed-content state.
 */
class ChatBlobIdentityChangedError extends Error {
  constructor() {
    // i18n-ignore-next-line: Error message for the console, never rendered
    super('chat blob discarded: the identity that requested it has changed');
    this.name = 'ChatBlobIdentityChangedError';
  }
}
