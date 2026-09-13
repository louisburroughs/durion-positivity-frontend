import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthAPIService } from '@durion-sdk/security';

/** One organization the login form may offer: what to show, and what to submit. */
export interface Organization {
  readonly slug: string;
  readonly displayName: string;
}

/** Matches the backend's `auth.tenant-search.min-query-length`; below it the API answers empty. */
export const MIN_QUERY_LENGTH = 3;

/**
 * OrganizationSearchService
 * -------------------------
 * Looks up the organizations a user may sign in to (ADR-0062 §3), so the login
 * form can offer names instead of demanding a tenant slug.
 *
 * Two behaviours matter more than they look:
 *
 * - **A failure is never an error message.** The endpoint is anonymous, and a
 *   distinct message for "not found" versus "server said no" would confirm to
 *   an unauthenticated caller whether an organization exists. Login itself
 *   already answers one indistinguishable 401 for every cause; the form must
 *   not undo that.
 * - **A failure is never "no matches" either.** Only an answered request can
 *   say nothing matched. Reporting a 500, a timeout or a dropped connection as
 *   an empty list left the caller waiting for a pick that could never be made,
 *   and the submit button disabled with it — an outage of the tenant directory
 *   became an outage of login, which is the one thing this form exists to do.
 *   Anything short of an answer is "could not ask", and the caller falls back
 *   to the slug field, as it did before the directory existed.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationSearchService {
  private readonly authApi = inject(AuthAPIService);

  /**
   * @returns the matches, `[]` when the directory answered and nothing matched,
   *   or `null` when it could not be asked at all — the directory is switched
   *   off (404) or unreachable — and the form should fall back to the slug
   *   field rather than wait for a pick that cannot happen
   */
  search(query: string): Observable<Organization[] | null> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return of([]);
    }
    return this.authApi.searchTenants(trimmed).pipe(
      map(results =>
        (results ?? [])
          .filter((r): r is { slug: string; displayName: string } => !!r?.slug && !!r?.displayName)
          .map(r => ({ slug: r.slug, displayName: r.displayName })),
      ),
      // Every failure alike: a 404 (directory switched off), a 5xx, a timeout,
      // a CORS or offline failure with no status at all. None of them is an
      // answer about this query, so none of them may be reported as one.
      catchError(() => of(null)),
    );
  }
}
