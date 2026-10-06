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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/services/auth.service';
import { SupplierVendorOption } from '../../models/supplier-profile.models';
import {
  MAX_VENDOR_PAGES,
  SupplierVendorService,
  VENDOR_PAGE_SIZE,
} from '../../services/supplier-vendor.service';
import { isForbidden } from '../../utils/supplier-error.util';

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

  /** The form's `vendorId` control. Must carry `Validators.required`. */
  readonly control = input.required<FormControl<string>>();
  /** DOM id of the `<select>`; the label and messages derive their ids from it. */
  readonly inputId = input.required<string>();
  /** Edit: the profile's vendor. Create: `null`. */
  readonly currentVendor = input<SupplierCurrentVendor | null>(null);
  /** Translation key of a server-side error on `vendorId`. */
  readonly errorKey = input<string | null>(null);
  /** Backend detail text for that error — server data, rendered beneath the label only. */
  readonly errorDetail = input<string | null>(null);

  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly select = viewChild<ElementRef<HTMLSelectElement>>('vendorSelect');
  private readonly statusMessage = viewChild<ElementRef<HTMLElement>>('statusMessage');

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

  private readonly identity = computed(
    () => `${this.auth.tenantId() ?? ''}|${this.auth.currentUserClaims()?.sub ?? ''}`,
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

  /** Nothing to choose from on create. */
  readonly empty = computed(() => this.state() === 'ready' && this.options().length === 0);

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
        currentVendorId: this.currentVendor()?.vendorId ?? '',
        attempt: this.attempt(),
      }),
      {
        equal: (a, b) =>
          a.identity === b.identity && a.currentVendorId === b.currentVendorId && a.attempt === b.attempt,
      },
    );

    toObservable(key)
      .pipe(
        switchMap(current => this.load(current).pipe(startWith(LOADING))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        this.result.set(result);
        if (result.state !== 'loading' && this.focusAfterLoad) {
          this.focusAfterLoad = false;
          afterNextRender(() => this.focusOutcome(), { injector: this.injector });
        }
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

  retry(): void {
    this.focusAfterLoad = true;
    this.attempt.update(value => value + 1);
  }

  private load(key: LoadKey): Observable<PickerResult> {
    if (!this.canRead()) {
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
