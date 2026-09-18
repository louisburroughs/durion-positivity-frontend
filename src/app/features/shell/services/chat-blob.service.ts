import { DestroyRef, inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, throwError } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';

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
 * Object URLs are cached per source URL (a thread re-renders on every keystroke
 * elsewhere) and revoked when the service goes away.
 */
@Injectable({ providedIn: 'root' })
export class ChatBlobService {
  private readonly api = inject(ApiBaseService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly inFlight = new Map<string, Observable<string>>();
  private readonly objectUrls = new Set<string>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const url of this.objectUrls) URL.revokeObjectURL(url);
      this.objectUrls.clear();
      this.inFlight.clear();
    });
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

    const cached = this.inFlight.get(url);
    if (cached) return cached;

    const request = this.api.getBlob(url, { baseUrlOverride: '' }).pipe(
      map(blob => {
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.add(objectUrl);
        return objectUrl;
      }),
      catchError((error: unknown) => {
        // Do not cache a failure: a token refresh can make the next try succeed.
        this.inFlight.delete(url);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlight.set(url, request);
    return request;
  }
}
