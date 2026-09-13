import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, map, switchMap } from 'rxjs';

import { LoginRequest } from '@durion-sdk/security';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LastTenantService } from '../../core/services/last-tenant.service';
import { ThemeService } from '../../core/services/theme.service';
import { normalizeTenantSlug } from '../../core/security/tenant';
import { tenantSlug } from '../../core/util/form-validators';
import { MIN_QUERY_LENGTH, Organization, OrganizationSearchService } from './organization-search.service';

/** How long to let someone keep typing before asking the server. */
const SEARCH_DEBOUNCE_MS = 250;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly organizationSearch = inject(OrganizationSearchService);
  private readonly lastTenant = inject(LastTenantService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly themeService = inject(ThemeService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sessionExpired = signal(false);

  /**
   * Tenant named by the page host (ADR-0062 §3). When set, the gateway resolves
   * the tenant from the Host header, so the form shows it read-only and sends
   * no slug; when null the host carries no tenant and the form asks for one.
   */
  readonly hostTenantSlug = signal<string | null>(this.authService.hostTenantSlug());

  /** The organization picked from the list; only a pick may be submitted. */
  readonly selected = signal<Organization | null>(null);

  readonly results = signal<Organization[]>([]);
  readonly searching = signal(false);
  readonly listOpen = signal(false);
  readonly activeIndex = signal(-1);

  /**
   * True once the directory has proved unaskable — switched off in this
   * deployment (404), down, or unreachable — so the form asks for a tenant slug
   * as it did before the directory existed. Starts false, and stays false for
   * as long as the directory keeps answering, even when it answers with
   * nothing: "no organization by that name" is a fact about the query, and the
   * user's job is to type a better one.
   */
  readonly searchUnavailable = signal(false);

  readonly noMatches = computed(
    () =>
      this.listOpen() &&
      !this.searching() &&
      this.results().length === 0 &&
      this.organizationQuery().trim().length >= MIN_QUERY_LENGTH,
  );

  readonly organizationQuery = signal('');

  private readonly queries = new Subject<string>();

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    organization: [''],
    // Only used on the fallback path; an empty slug lets the gateway resolve.
    tenantSlug: ['', [tenantSlug]],
  });

  constructor() {
    effect(onCleanup => {
      const subscription = this.queries
        .pipe(
          debounceTime(SEARCH_DEBOUNCE_MS),
          // Deliberately not deduplicated. Editing back to text already asked
          // about — "acm", backspace, "m" again — has to reach the server:
          // `onOrganizationInput` has already turned `searching` on, and only a
          // response turns it off. Suppressing the repeat would strand the field
          // on "Searching…" with the list shut and Sign in refused until the
          // user typed something else. The debounce is what keeps the request
          // count down; at most one redundant lookup per retype is the price.
          // Cancels the in-flight lookup when a newer query passes the debounce.
          switchMap(query => this.organizationSearch.search(query).pipe(map(matches => ({ query, matches })))),
        )
        .subscribe(({ query, matches }) => {
          // Not an answer about this query but about the directory itself, so
          // it is honoured whenever it arrives, however stale the text it was
          // asked for.
          if (matches === null) {
            this.searching.set(false);
            this.searchUnavailable.set(true);
            this.listOpen.set(false);
            return;
          }
          // Everything else is discarded unless it answers what is in the field
          // right now. switchMap alone is not enough: it only cancels when a new
          // query passes the debounce, so backspacing below the minimum — which
          // sends nothing — would let an in-flight response reopen the list with
          // options that no longer match the input, and one could then be picked
          // and submitted.
          if (query !== this.organizationQuery()) return;
          this.searching.set(false);
          this.results.set(matches);
          this.activeIndex.set(-1);
          this.listOpen.set(true);
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('sessionExpired') === 'true') {
      this.sessionExpired.set(true);
    }
    const remembered = this.lastTenant.remembered();
    // A tenant-bearing host wins: the address the user came to is the tenant.
    if (remembered && !this.hostTenantSlug()) {
      this.selected.set(remembered);
      this.organizationQuery.set(remembered.displayName);
      this.form.controls.organization.setValue(remembered.displayName);
    }
  }

  onOrganizationInput(value: string): void {
    this.organizationQuery.set(value);
    // Typing after a pick invalidates it: the form submits what was chosen.
    this.selected.set(null);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      this.results.set([]);
      this.listOpen.set(false);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.queries.next(value);
  }

  choose(organization: Organization): void {
    this.selected.set(organization);
    this.organizationQuery.set(organization.displayName);
    this.form.controls.organization.setValue(organization.displayName);
    this.listOpen.set(false);
    this.activeIndex.set(-1);
  }

  /** "Use a different organization": clears the pick and what was remembered. */
  changeOrganization(): void {
    this.lastTenant.forget();
    this.selected.set(null);
    this.organizationQuery.set('');
    this.form.controls.organization.setValue('');
    this.results.set([]);
    this.listOpen.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.listOpen() || this.results().length === 0) {
      if (event.key === 'ArrowDown' && this.results().length > 0) {
        // Reopening after Escape must land on an option: leaving activeIndex at
        // -1 would make the next Enter choose nothing.
        this.listOpen.set(true);
        this.activeIndex.set(0);
        this.scrollActiveIntoView();
        event.preventDefault();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update(i => (i + 1) % this.results().length);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update(i => (i <= 0 ? this.results().length - 1 : i - 1));
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        const active = this.results()[this.activeIndex()];
        if (active) {
          event.preventDefault();
          this.choose(active);
        }
        break;
      }
      case 'Escape':
        this.listOpen.set(false);
        this.activeIndex.set(-1);
        break;
      default:
        break;
    }
  }

  /** Whether the organization the form will submit is settled. */
  readonly organizationReady = computed(
    () => !!this.hostTenantSlug() || this.searchUnavailable() || this.selected() !== null,
  );

  submit(): void {
    if (this.form.invalid || this.loading() || !this.organizationReady()) return;

    this.error.set(null);
    this.loading.set(true);

    const { username, password } = this.form.getRawValue();
    const request: LoginRequest = { username, password };

    const chosen = this.selected();
    if (!this.hostTenantSlug()) {
      if (chosen) {
        request.tenantSlug = chosen.slug;
      } else if (this.searchUnavailable()) {
        const slug = normalizeTenantSlug(this.form.getRawValue().tenantSlug);
        if (slug) request.tenantSlug = slug;
      }
    }

    this.authService.login(request).subscribe({
      next: () => {
        this.loading.set(false);
        // Remembered only now: a failed attempt must not be offered back.
        if (chosen) this.lastTenant.remember(chosen);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/chat';
        const safeReturnUrl = returnUrl.startsWith('/') ? returnUrl : '/chat';
        this.router.navigateByUrl(safeReturnUrl);
      },
      error: err => {
        this.loading.set(false);
        const status = err?.status;
        // An unknown or inactive tenant answers the same 401 as bad credentials,
        // and is reported the same way — the form never confirms a tenant exists.
        if (status === 401 || status === 403) {
          this.error.set('AUTH.LOGIN.ERROR.INVALID_CREDENTIALS');
        } else if (status === 0) {
          this.error.set('AUTH.LOGIN.ERROR.NETWORK');
        } else {
          this.error.set('AUTH.LOGIN.ERROR.GENERIC');
        }
      },
    });
  }

  optionId(index: number): string {
    return `organization-option-${index}`;
  }

  /**
   * True only when the popup actually has options. Announcing an expanded popup
   * with nothing in it is what a screen reader would otherwise be told while the
   * "no matches" message is live.
   */
  readonly listExpanded = computed(() => this.listOpen() && this.results().length > 0);

  /**
   * Free text the user never picked from the list. The error was previously
   * announced by an alert while the input itself carried neither `aria-invalid`
   * nor the invalid styling the other login fields use, so assistive technology
   * was told an alert existed without being told which control was wrong.
   */
  readonly organizationInvalid = computed(
    () => !this.organizationReady() && this.organizationQuery().length > 0 && !this.listOpen(),
  );

  /**
   * Keeps the active option inside the scrollable list. Focus stays in the input
   * and only `aria-activedescendant` moves, so nothing scrolls on its own; past
   * the visible part of the list a keyboard user would be choosing an option
   * they cannot see.
   */
  private scrollActiveIntoView(): void {
    const index = this.activeIndex();
    if (index < 0 || typeof document === 'undefined') return;
    queueMicrotask(() => {
      document.getElementById(this.optionId(index))?.scrollIntoView({ block: 'nearest' });
    });
  }

  get usernameCtrl() { return this.form.controls.username; }
  get passwordCtrl() { return this.form.controls.password; }
  get tenantSlugCtrl() { return this.form.controls.tenantSlug; }
}
