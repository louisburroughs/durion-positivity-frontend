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
    const key = this.cacheKey(url);
    const cached = this.inFlight.get(key);
    if (cached) return cached;

    const request = this.api.getBlob(url, { baseUrlOverride: '' }).pipe(
      map(blob => {
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.add(objectUrl);
        return objectUrl;
      }),
      catchError((error: unknown) => {
        // Do not cache a failure: a token refresh can make the next try succeed.
        this.inFlight.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlight.set(key, request);
    return request;
  }

  /** Tenant + subject first, so no two identities can share a cache entry. */
  private cacheKey(url: string): string {
    return `${identityKey(this.auth.currentUserClaims())}|${url}`;
  }

  private discard(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.inFlight.clear();
  }
}
