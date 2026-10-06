import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../../../core/services/auth.service';
import { SupplierVendorOption } from '../../models/supplier-profile.models';
import {
  MAX_VENDOR_PAGES,
  SupplierVendorService,
  VENDOR_PAGE_SIZE,
} from '../../services/supplier-vendor.service';
import { isForbidden } from '../../utils/supplier-error.util';
import { supplierIdentityKey } from '../../utils/supplier-identity.util';

/** Permission the vendor reads require (backend S23, #2516). */
export const SUPPLIER_VENDOR_READ = 'supplier:vendor:read';

/** The profile's current vendor as the profile view names it. */
export interface SupplierCurrentVendor {
  vendorId: string;
  vendorNumber: string;
  displayName: string;
}

type PickerState = 'loading' | 'ready' | 'forbidden' | 'error';

/** Status of the profile's own vendor: `unknown` when it could not be read. */
type CurrentStatus = 'active' | 'inactive' | 'unknown';

interface PickerResult {
  state: PickerState;
  vendors: SupplierVendorOption[];
  truncated: boolean;
  currentStatus: CurrentStatus;
}

interface LoadKey {
  identity: string;
  /** Part of the key so a token refresh that grants or revokes the read re-evaluates. */
  canRead: boolean;
  currentVendorId: string;
  attempt: number;
}

const LOADING: PickerResult = { state: 'loading', vendors: [], truncated: false, currentStatus: 'unknown' };

/**
 * Required **Vendor** picker for the supplier-profile create and edit forms (#484).
 *
 * Since backend S23 every profile belongs to one pos-supplier vendor, and
 * `vendorId` is required on create and update. The picker lists the tenant's
 * ACTIVE vendors (every page, bounded — see `SupplierVendorService`).
 *
 * On edit the profile's current vendor is always offered and pre-selected. When
 * it has gone INACTIVE it stays selectable and is labelled as inactive — the
 * backend allows keeping it — but no other inactive vendor is ever offered,
 * because re-pointing to a different inactive vendor is a `422`.
 *
 * Without `supplier:vendor:read` (decoded from the token, or a `403` from the
 * read) the picker says so instead of rendering an empty list. On edit the
 * profile then keeps its current vendor, shown as read-only text; on create the
 * form cannot be submitted, and the message explains why.
 *
 * Async results are bound to what they were requested for: the load key is the
 * signed-in identity plus the current vendor, and `switchMap` drops a response
 * whose key has since changed (ADR-0063).
 */
@Component({
  selector: 'app-supplier-vendor-picker',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './supplier-vendor-picker.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-vendor-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierVendorPickerComponent {
  private readonly vendorService = inject(SupplierVendorService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  /** The form's `vendorId` control. Must carry `Validators.required`. */
  readonly control = input.required<FormControl<string>>();
  /** DOM id of the `<select>`; the label and messages derive their ids from it. */
  readonly inputId = input.required<string>();
  /** Edit: the profile's vendor. Create: `null`. */
  readonly currentVendor = input<SupplierCurrentVendor | null>(null);
  /** Which form hosts the picker — decides the wording of the status messages. */
  readonly mode = input<'create' | 'edit'>('create');
  /** Translation key of a server-side error on `vendorId`. */
  readonly errorKey = input<string | null>(null);
  /** Backend detail text for that error — server data, rendered beneath the label only. */
  readonly errorDetail = input<string | null>(null);

  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly select = viewChild<ElementRef<HTMLSelectElement>>('vendorSelect');
  private readonly statusMessage = viewChild<ElementRef<HTMLElement>>('statusMessage');
  private readonly loadingMessage = viewChild<ElementRef<HTMLElement>>('loadingMessage');

  private readonly attempt = signal(0);
  private readonly result = signal<PickerResult>(LOADING);
  /** Bumped on every control event so OnPush picks up touched/validity changes. */
  private readonly controlTick = signal(0);
  private focusAfterLoad = false;

  /** Most vendors the picker lists before saying the list is cut short. */
  readonly maxListed = MAX_VENDOR_PAGES * VENDOR_PAGE_SIZE;

  readonly state = computed(() => this.result().state);
  readonly truncated = computed(() => this.result().truncated);
  readonly currentStatus = computed(() => this.result().currentStatus);

  /** True when the token says the caller may read vendors, or does not say at all. */
  private readonly canRead = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasPermission(SUPPLIER_VENDOR_READ),
  );

  /** `tid|sub`, each half percent-encoded so distinct identities never share a key. */
  private readonly identity = computed(() =>
    supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub),
  );

  /**
   * Choices: the active roster, plus the profile's own vendor first when the
   * roster does not already hold it (it went inactive, or sits past the bound).
   */
  readonly options = computed<SupplierVendorOption[]>(() => {
    const vendors = this.result().vendors;
    const current = this.currentVendor();
    if (!current?.vendorId || vendors.some(vendor => vendor.vendorId === current.vendorId)) {
      return vendors;
    }
    return [
      {
        vendorId: current.vendorId,
        vendorNumber: current.vendorNumber,
        displayName: current.displayName,
        active: this.currentStatus() === 'active',
      },
      ...vendors,
    ];
  });

  /** The profile's vendor is known to be INACTIVE. */
  readonly currentInactive = computed(() => !!this.currentVendor()?.vendorId && this.currentStatus() === 'inactive');

  /** Nothing to choose from. */
  readonly empty = computed(() => this.state() === 'ready' && this.options().length === 0);

  readonly forbiddenKey = computed(() =>
    this.currentVendor()
      ? 'POSITIVITY.PROFILES.VENDOR.FORBIDDEN_EDIT'
      : this.mode() === 'edit'
        ? 'POSITIVITY.PROFILES.VENDOR.FORBIDDEN_CHOOSE'
        : 'POSITIVITY.PROFILES.VENDOR.FORBIDDEN_CREATE',
  );

  readonly loadErrorKey = computed(() =>
    this.currentVendor() ? 'POSITIVITY.PROFILES.VENDOR.LOAD_ERROR_EDIT' : 'POSITIVITY.PROFILES.VENDOR.LOAD_ERROR',
  );

  readonly emptyKey = computed(() =>
    this.mode() === 'edit' ? 'POSITIVITY.PROFILES.VENDOR.EMPTY_EDIT' : 'POSITIVITY.PROFILES.VENDOR.EMPTY',
  );

  /** Client-side "choose a vendor" message: touched, empty, and no server message. */
  readonly showRequired = computed(() => {
    this.controlTick();
    const control = this.control();
    return !this.errorKey() && control.touched && control.hasError('required');
  });

  constructor() {
    effect(onCleanup => {
      const subscription = this.control().events.subscribe(() => this.controlTick.update(tick => tick + 1));
      onCleanup(() => subscription.unsubscribe());
    });

    const key = computed<LoadKey>(
      () => ({
        identity: this.identity(),
        canRead: this.canRead(),
        currentVendorId: this.currentVendor()?.vendorId ?? '',
        attempt: this.attempt(),
      }),
      {
        equal: (a, b) =>
          a.identity === b.identity &&
          a.canRead === b.canRead &&
          a.currentVendorId === b.currentVendorId &&
          a.attempt === b.attempt,
      },
    );

    let previous: LoadKey | null = null;
    toObservable(key)
      .pipe(
        tap(next => {
          if (previous) {
            this.reconcile();
          }
          previous = next;
        }),
        switchMap(current => this.load(current).pipe(startWith(LOADING))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        this.result.set(result);
        if (!this.focusAfterLoad) {
          return;
        }
        // A retry removes the Retry button. While loading, the loading message
        // holds focus; once settled, focus moves to the outcome — never <body>.
        const settled = result.state !== 'loading';
        if (settled) {
          this.focusAfterLoad = false;
        }
        afterNextRender(() => (settled ? this.focusOutcome() : this.loadingMessage()?.nativeElement.focus()), {
          injector: this.injector,
        });
      });
  }

  messageId(suffix: string): string {
    return `${this.inputId()}-${suffix}`;
  }

  /** `aria-describedby` for the select: whichever messages are on screen. */
  describedBy(): string | null {
    const ids: string[] = [];
    if (this.errorKey() || this.showRequired()) ids.push(this.messageId('error'));
    if (this.currentInactive()) ids.push(this.messageId('inactive'));
    if (this.truncated()) ids.push(this.messageId('truncated'));
    return ids.length > 0 ? ids.join(' ') : null;
  }

  /**
   * Every key-driven reload (identity, permission, current vendor, retry)
   * re-derives the control from what this key may legitimately hold (ADR-0063):
   * create clears it, edit puts back the profile's own vendor. A choice made
   * under another identity or permission never survives into a submit. The host
   * pages reset their own state on an identity change (ADR-0063 §7).
   *
   * If focus is inside the picker, the reload is about to remove the focused
   * control; focus is parked on the loading message and then moved to the
   * outcome (ADR-0029 §8.7).
   */
  private reconcile(): void {
    const active = this.document.activeElement;
    if (active && active !== this.document.body && this.host.nativeElement.contains(active)) {
      this.focusAfterLoad = true;
    }
    this.control().setValue(this.currentVendor()?.vendorId ?? '');
  }

  retry(): void {
    this.focusAfterLoad = true;
    this.attempt.update(value => value + 1);
  }

  private load(key: LoadKey): Observable<PickerResult> {
    if (!key.canRead) {
      return of({ ...LOADING, state: 'forbidden' as const });
    }
    return this.vendorService.listActiveVendors().pipe(
      switchMap(roster => {
        const inRoster = roster.vendors.some(vendor => vendor.vendorId === key.currentVendorId);
        const status$: Observable<CurrentStatus> =
          !key.currentVendorId || inRoster
            ? of<CurrentStatus>('active')
            : this.vendorService.getVendor(key.currentVendorId).pipe(
                map((vendor): CurrentStatus => (vendor.active ? 'active' : 'inactive')),
                catchError(() => of<CurrentStatus>('unknown')),
              );
        return status$.pipe(
          map(
            (currentStatus): PickerResult => ({
              state: 'ready',
              vendors: roster.vendors,
              truncated: roster.truncated,
              currentStatus,
            }),
          ),
        );
      }),
      catchError((err: unknown) => of({ ...LOADING, state: isForbidden(err) ? ('forbidden' as const) : ('error' as const) })),
    );
  }

  /** After a retry the Retry button is gone; put focus where the outcome is, never on `<body>`. */
  private focusOutcome(): void {
    const target =
      this.state() === 'error'
        ? this.retryButton()
        : this.state() === 'ready' && !this.empty()
          ? this.select()
          : this.statusMessage();
    target?.nativeElement.focus();
  }
}
