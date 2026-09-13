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
 * - **A failure is "no matches", never an error message.** The endpoint is
 *   anonymous, and a distinct message for "not found" versus "server said no"
 *   would confirm to an unauthenticated caller whether an organization exists.
 *   Login itself already answers one indistinguishable 401 for every cause; the
 *   form must not undo that.
 * - **A 404 means the directory is switched off** in this deployment, which is
 *   a supported configuration. The caller falls back to asking for the slug, so
 *   that case is reported separately from "no matches".
 */
@Injectable({ providedIn: 'root' })
export class OrganizationSearchService {
  private readonly authApi = inject(AuthAPIService);

  /**
   * @returns the matches, or `null` when the directory is unavailable and the
   *   form should fall back to the slug field
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
      catchError((err: { status?: number }) => of(err?.status === 404 ? null : [])),
    );
  }
}
