import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap, tap } from 'rxjs/operators';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';
import { SupplierVendorOption } from '../../../../../shared/supplier-vendors/models/supplier-vendor-roster.models';
import {
  MAX_VENDOR_PAGES,
  SupplierVendorRosterService,
  VENDOR_PAGE_SIZE,
} from '../../../../../shared/supplier-vendors/services/supplier-vendor-roster.service';
import {
  CreatePurchaseOrderLine,
  CreatePurchaseOrderRequest,
  PurchaseOrderDetail,
} from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PoSupplierAvailabilityPanelComponent } from '../../../components/po-supplier-availability-panel/po-supplier-availability-panel.component';
import { inventoryIdentityKey } from '../../../utils/inventory-identity.util';
import {
  PurchaseOrderCommand,
  PurchaseOrderFailure,
  PurchaseOrderFailureCode,
  PurchaseOrderField,
  classifyPurchaseOrderError,
} from '../../../utils/purchase-order-errors';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

/** The vendor list's read: `forbidden` without `supplier:vendor:read` (token or 403). */
export type VendorListState = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * What is known about an edited order's own vendor: listed as ACTIVE, or read on
 * its own as `inactive`, `missing` from the vendor master (a requested order can
 * name a vendor that was never set up), or `unknown` when that read failed.
 */
export type CurrentVendorStatus = 'active' | 'inactive' | 'missing' | 'unknown';

interface VendorList {
  readonly state: VendorListState;
  readonly vendors: readonly SupplierVendorOption[];
  readonly truncated: boolean;
  /** The edited order's own vendor, as read; `null` on create or when it could not be read. */
  readonly current: SupplierVendorOption | null;
  readonly currentStatus: CurrentVendorStatus;
}

interface VendorListKey {
  readonly identity: string;
  /** Part of the key so a token refresh that grants or revokes the read re-evaluates. */
  readonly canRead: boolean;
  /** `''` on create; the order's vendor on edit; `null` while the order is not read yet. */
  readonly currentVendorId: string | null;
  readonly attempt: number;
}

/** One `<option>` of the vendor picker, labelled by translation key. */
export interface VendorChoice {
  readonly vendorId: string;
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
}

interface Copy {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

const FORM = 'INVENTORY.PURCHASE_ORDERS.FORM';

/** The read the vendor picker needs (pos-supplier `listSupplierVendors` / `getSupplierVendor`). */
export const SUPPLIER_VENDOR_READ = 'supplier:vendor:read';

/** Create and revise both enforce `order:purchase_order:create`. */
const WRITE = INVENTORY_PAGE.purchaseOrderEdit;

const VENDORS_LOADING: VendorList = {
  state: 'loading',
  vendors: [],
  truncated: false,
  current: null,
  currentStatus: 'unknown',
};

const sameKey = (a: VendorListKey, b: VendorListKey): boolean =>
  a.identity === b.identity &&
  a.canRead === b.canRead &&
  a.currentVendorId === b.currentVendorId &&
  a.attempt === b.attempt;

/**
 * Purchase-order create/revise form.
 *
 * This is the screen that owns purchase-order **line editing** (`addLine`,
 * `removeLine`, `updateLine`). The per-line supplier availability check that
 * used to sit here (#190) was restored in #212 against the generated fan-out
 * read (`getSupplierStockAvailability`); see `PoSupplierAvailabilityPanelComponent`
 * and `SupplierAvailabilityService` for why that read was chosen
 * over `getPurchaseOrderSupplierAvailability`.
 *
 * ── Vendor (CAP:550, #514) ───────────────────────────────────────────────────
 * Since S24 (backend #2648) pos-order checks the vendor against its copy of the
 * pos-supplier vendor master: 422 `VENDOR_INACTIVE`, 503 `VENDOR_REPLICATION_PENDING`.
 * - The vendor is picked from the tenant's ACTIVE vendors (`SupplierVendorRosterService`,
 *   `supplier:vendor:read`), never typed. Without that read, or while the list is
 *   loading or failed, **Submit** on a new order is blocked with its reason.
 * - A revision sends `vendorId` only when it changes a DRAFT order's vendor; past
 *   DRAFT the vendor is shown read-only, and a 409 locks it here too.
 * - A DRAFT order whose vendor is inactive or not in the vendor master — how an
 *   order requested on `order.commands.v1` can arrive — is prompted to change it:
 *   approval refuses it until a revision does.
 * - Both commands enforce `order:purchase_order:create`; Submit and `submit()`
 *   re-check it independently of the route (ADR-0040 §6a).
 * - Neither command carries an idempotency key: a timeout or 5xx is reported as
 *   an unknown outcome, never as a refusal.
 * - A `tid|sub` change drops everything typed and every in-flight result (ADR-0063 §7).
 */
@Component({
  selector: 'app-po-form',
  standalone: true,
  imports: [TranslatePipe, FormsModule, RouterLink, PoSupplierAvailabilityPanelComponent],
  templateUrl: './po-form.component.html',
  styleUrl: './po-form.component.css',
})
export class PoFormComponent {
  private readonly poService = inject(InventoryPurchaseOrderService);
  private readonly vendorRoster = inject(SupplierVendorRosterService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly errorParams = signal<Readonly<Record<string, string | number>>>({});
  /** The last command failure's code, for the outcome-specific follow-up controls. */
  readonly failureCode = signal<PurchaseOrderFailureCode | null>(null);
  readonly fieldErrors = signal<Readonly<Partial<Record<PurchaseOrderField, string>>>>({});
  readonly vendorId = signal('');
  readonly scheduledDeliveryDate = signal('');
  readonly notes = signal('');
  readonly revisionReason = signal('');
  readonly lines = signal<CreatePurchaseOrderLine[]>([]);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly editingPoId = signal<string | null>(null);
  /** The edited order as last read. */
  readonly order = signal<PurchaseOrderDetail | null>(null);
  readonly vendorList = signal<VendorList>(VENDORS_LOADING);
  /** Set by a 409 on a vendor change: the server says the order is past DRAFT. */
  readonly vendorLocked = signal(false);

  /** Index of the line whose availability-check panel is expanded, if any. */
  readonly availabilityCheckLineIndex = signal<number | null>(null);

  /** Most vendors the picker lists before saying the list is cut short. */
  readonly maxListed = MAX_VENDOR_PAGES * VENDOR_PAGE_SIZE;

  private readonly vendorAttempt = signal(0);
  private saveSeq = 0;
  private loadSeq = 0;
  /** Focus was in the vendor field when it reloaded: land on the outcome (ADR-0029 §8.7). */
  private focusVendorOutcome = false;

  private readonly identity = computed(() =>
    inventoryIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub),
  );
  private trackedIdentity = this.identity();

  /** Create and revise enforce `order:purchase_order:create`; unknown `perm_bits` falls back to the route. */
  readonly canWrite = computed(() => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(WRITE));
  readonly canReadVendors = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasPermission(SUPPLIER_VENDOR_READ),
  );

  /** The form shows on create, and on edit once the order has been read. */
  readonly formShown = computed(() => this.editingPoId() === null || this.order() !== null);
  /** A new order picks its vendor; an edited one may change it only while DRAFT. */
  readonly vendorEditable = computed(
    () => this.editingPoId() === null || (this.order()?.status === 'DRAFT' && !this.vendorLocked()),
  );

  readonly vendorChoices = computed<VendorChoice[]>(() => {
    const list = this.vendorList();
    const choices = list.vendors.map(vendor => this.choice(vendor, 'active'));
    const order = this.order();
    if (this.editingPoId() === null || !order || list.vendors.some(vendor => vendor.vendorId === order.supplierId)) {
      return choices;
    }
    return [this.currentChoice(order.supplierId, list), ...choices];
  });

  /** The picker is offered: an editable vendor and a read list with something in it. */
  readonly pickerShown = computed(
    () => this.vendorEditable() && this.vendorList().state === 'ready' && this.vendorChoices().length > 0,
  );

  /** No active vendor to choose on a new order. */
  readonly noVendors = computed(
    () => this.editingPoId() === null && this.vendorList().state === 'ready' && this.vendorList().vendors.length === 0,
  );

  /** The chosen vendor changes an edited order's vendor. */
  readonly vendorChanged = computed(() => {
    const order = this.order();
    return this.editingPoId() !== null && !!order && this.vendorId() !== '' && this.vendorId() !== order.supplierId;
  });

  /** The listed vendor the edit moves the order to, for the consequence sentence. */
  readonly newVendor = computed(() =>
    this.vendorChanged() ? (this.vendorList().vendors.find(vendor => vendor.vendorId === this.vendorId()) ?? null) : null,
  );

  /** The edited order's vendor as read-only text: listed, inactive, missing, or not readable. */
  readonly currentVendorText = computed<Copy>(() => {
    const order = this.order();
    if (!order) return { key: `${FORM}.VENDOR.CURRENT_UNREAD`, params: {} };
    const list = this.vendorList();
    if (list.state !== 'ready') return { key: `${FORM}.VENDOR.CURRENT_UNREAD`, params: {} };
    const choice = this.currentChoice(order.supplierId, list);
    return { key: choice.key, params: choice.params };
  });

  /**
   * A DRAFT order whose vendor cannot take it is prompted to change it — an order
   * requested on `order.commands.v1` can name an inactive vendor or one that was
   * never set up, and approval refuses it until a revision changes the vendor.
   */
  readonly vendorPromptKey = computed<string | null>(() => {
    if (this.editingPoId() === null || !this.vendorEditable() || this.vendorChanged()) return null;
    const list = this.vendorList();
    if (list.state !== 'ready') return null;
    if (list.currentStatus === 'inactive') return `${FORM}.VENDOR.PROMPT_INACTIVE`;
    if (list.currentStatus === 'missing') return `${FORM}.VENDOR.PROMPT_MISSING`;
    return null;
  });

  readonly vendorErrorKey = computed<string | null>(() => {
    const server = this.fieldErrors().vendorId;
    if (server) return server;
    return this.submitted() && this.editingPoId() === null && this.vendorId() === '' ? `${FORM}.VENDOR.REQUIRED` : null;
  });

  readonly reasonErrorKey = computed<string | null>(() => {
    const server = this.fieldErrors().revisionReason;
    if (server) return server;
    return this.submitted() && this.editingPoId() !== null && this.revisionReason().trim() === ''
      ? `${FORM}.REASON.REQUIRED`
      : null;
  });

  /**
   * Why Submit cannot be used, or `null`. Re-checked by `submit()` itself, so a
   * revoked permission or an unread vendor list never reaches the server.
   */
  readonly blockedKey = computed<string | null>(() => {
    if (!this.canWrite()) return `${FORM}.BLOCKED.NO_PERMISSION`;
    if (this.editingPoId() !== null) return null;
    switch (this.vendorList().state) {
      case 'forbidden':
        return `${FORM}.BLOCKED.VENDOR_FORBIDDEN`;
      case 'error':
        return `${FORM}.BLOCKED.VENDOR_ERROR`;
      case 'loading':
        return `${FORM}.BLOCKED.VENDOR_LOADING`;
      default:
        return this.noVendors() ? `${FORM}.BLOCKED.NO_VENDORS` : null;
    }
  });

  constructor() {
    const poId = this.route.snapshot.paramMap.get('poId');
    if (poId) {
      this.editingPoId.set(poId);
      this.loadExistingPo(poId, false);
    } else {
      this.state.set('ready');
    }

    // ADR-0063 §7: another tenant or person — whatever was typed or in flight belonged to the previous one.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => this.resetForIdentity());
    });

    const key = computed<VendorListKey>(
      () => ({
        identity: this.identity(),
        canRead: this.canReadVendors(),
        currentVendorId: this.editingPoId() === null ? '' : (this.order()?.supplierId ?? null),
        attempt: this.vendorAttempt(),
      }),
      { equal: sameKey },
    );

    toObservable(key)
      .pipe(
        tap(() => {
          if (this.focusInside('[data-testid="po-vendor-field"]')) this.focusVendorOutcome = true;
        }),
        switchMap(current => this.readVendors(current).pipe(startWith(VENDORS_LOADING))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(list => {
        this.vendorList.set(list);
        if (list.state === 'ready') this.reconcileVendor(list);
        this.settleVendorFocus(list);
      });
  }

  /** Load the vendor list again (its Retry control). */
  retryVendors(): void {
    this.focusVendorOutcome = true;
    this.vendorAttempt.update(attempt => attempt + 1);
  }

  chooseVendor(vendorId: string): void {
    if (!this.vendorEditable()) return;
    this.vendorId.set(vendorId);
    this.fieldErrors.update(({ vendorId: _vendor, ...rest }) => rest);
  }

  setRevisionReason(value: string): void {
    this.revisionReason.set(value);
    this.fieldErrors.update(({ revisionReason: _reason, ...rest }) => rest);
  }

  addLine(): void {
    this.lines.update(lines => [...lines, { productSku: '', orderedQty: 1, unitPrice: 0 }]);
  }

  removeLine(idx: number): void {
    this.lines.update(lines => lines.filter((_, i) => i !== idx));
    const openIdx = this.availabilityCheckLineIndex();
    if (openIdx === null) {
      return;
    }
    if (openIdx === idx) {
      // The removed line owned the open panel: nothing left to point at.
      this.availabilityCheckLineIndex.set(null);
    } else if (idx < openIdx) {
      // A line before the open one was removed: every later index shifts down one.
      this.availabilityCheckLineIndex.set(openIdx - 1);
    }
    // idx > openIdx: removal happened after the open line, its index is unaffected.
  }

  /** Expand or collapse the availability-check panel for one line (#212). */
  toggleAvailabilityCheck(idx: number): void {
    this.availabilityCheckLineIndex.set(this.availabilityCheckLineIndex() === idx ? null : idx);
  }

  updateLine(idx: number, field: keyof CreatePurchaseOrderLine, val: string | number): void {
    if (field === 'orderedQty' || field === 'unitPrice') {
      const numVal = Number(val);
      if (!Number.isFinite(numVal) || numVal < 0) {
        return;
      }
    }
    this.lines.update(lines =>
      lines.map((line, i) => (i === idx ? { ...line, [field]: val } : line)),
    );
  }

  submit(): void {
    if (this.submitting() || this.blockedKey() !== null) return;
    this.submitted.set(true);
    const poId = this.editingPoId();

    if (poId === null) {
      const vendorId = this.vendorId();
      // Only a vendor of the current ACTIVE list is ever sent (the list is the gate, ADR-0063 §3).
      if (!this.vendorList().vendors.some(vendor => vendor.vendorId === vendorId)) {
        this.focusAfterRender('#po-vendor');
        return;
      }
      const request: CreatePurchaseOrderRequest = {
        vendorId,
        scheduledDeliveryDate: this.scheduledDeliveryDate(),
        notes: this.notes() || undefined,
        lines: this.lines(),
      };
      this.run('create', this.poService.createPurchaseOrder(request));
      return;
    }

    const order = this.order();
    if (!order) return;
    const reason = this.revisionReason().trim();
    if (reason === '') {
      this.focusAfterRender('#po-revision-reason');
      return;
    }
    const changesVendor = this.vendorChanged();
    // A vendor change only while DRAFT, and only to a vendor of the current ACTIVE list.
    if (changesVendor && (!this.vendorEditable() || this.newVendor() === null)) return;
    this.run(
      'revise',
      this.poService.revisePurchaseOrder(poId, {
        current: order,
        vendorId: changesVendor ? this.vendorId() : undefined,
        revisionReason: reason,
        scheduledDeliveryDate: this.scheduledDeliveryDate(),
        notes: this.notes(),
        lines: this.lines(),
      }),
    );
  }

  /** After an unconfirmed revision: read the order as the server has it. */
  readOrderAgain(): void {
    const poId = this.editingPoId();
    if (poId === null || this.submitting()) return;
    this.loadExistingPo(poId, false);
  }

  goBack(): void {
    const poId = this.editingPoId();
    if (poId) {
      this.router.navigate(['/app/inventory/purchase-orders', poId]);
    } else {
      this.router.navigate(['/app/inventory/purchase-orders']);
    }
  }

  /** `aria-describedby` of the vendor control: whichever messages are on screen. */
  vendorDescribedBy(): string | null {
    const ids: string[] = [];
    if (this.vendorErrorKey()) ids.push('po-vendor-error');
    if (this.vendorPromptKey()) ids.push('po-vendor-prompt');
    if (this.vendorList().truncated) ids.push('po-vendor-truncated');
    return ids.length > 0 ? ids.join(' ') : null;
  }

  submitDescribedBy(): string {
    return this.blockedKey() ? 'po-submit-blocked po-consequence' : 'po-consequence';
  }

  private run(command: PurchaseOrderCommand, request: Observable<PurchaseOrderDetail>): void {
    const seq = ++this.saveSeq;
    this.submitting.set(true);
    this.state.set('ready');
    this.errorKey.set(null);
    this.errorParams.set({});
    this.failureCode.set(null);
    this.fieldErrors.set({});

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        if (seq !== this.saveSeq) return;
        this.submitting.set(false);
        this.router.navigate(['/app/inventory/purchase-orders', saved.poId]);
      },
      error: (err: unknown) => {
        if (seq !== this.saveSeq) return;
        this.submitting.set(false);
        this.fail(classifyPurchaseOrderError(err, command));
      },
    });
  }

  private fail(failure: PurchaseOrderFailure): void {
    this.state.set('error');
    this.errorKey.set(failure.key);
    this.errorParams.set(failure.params);
    this.failureCode.set(failure.code);
    this.fieldErrors.set(failure.fieldErrors);
    if (failure.rereadVendors) {
      // The chosen vendor went inactive: the list is stale. The reload drops it from the choice.
      this.vendorAttempt.update(attempt => attempt + 1);
    }
    const order = this.order();
    const poId = this.editingPoId();
    if (failure.rereadOrder && order && poId !== null) {
      // 409: the order is past DRAFT. Lock the vendor now, so it holds even if the re-read fails.
      this.vendorLocked.set(true);
      this.vendorId.set(order.supplierId);
      this.loadExistingPo(poId, true);
    }
    this.focusAfterRender('[data-testid="po-form-error"]');
  }

  /**
   * Read the order. `keepTyped` keeps what was typed (a re-read after a 409) and
   * takes only the server's status and vendor; otherwise the form shows the order.
   */
  private loadExistingPo(poId: string, keepTyped: boolean): void {
    const seq = ++this.loadSeq;
    if (!keepTyped) {
      this.state.set('loading');
      this.errorKey.set(null);
    }

    this.poService
      .getPurchaseOrder(poId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: po => {
          if (seq !== this.loadSeq) return;
          this.order.set(po);
          this.vendorId.set(po.supplierId);
          if (po.status === 'DRAFT' && !keepTyped) this.vendorLocked.set(false);
          if (keepTyped) return;
          this.scheduledDeliveryDate.set(po.scheduledDeliveryDate);
          this.notes.set(po.notes ?? '');
          this.revisionReason.set('');
          this.submitted.set(false);
          this.fieldErrors.set({});
          this.failureCode.set(null);
          this.errorParams.set({});
          this.lines.set(
            po.lines.map(l => ({
              productSku: l.productSku,
              orderedQty: l.orderedQty,
              unitPrice: l.unitPrice,
            })),
          );
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: () => {
          if (seq !== this.loadSeq || keepTyped) return;
          this.state.set('error');
          this.errorKey.set(`${FORM}.ERROR.LOAD`);
        },
      });
  }

  private readVendors(key: VendorListKey): Observable<VendorList> {
    if (key.currentVendorId === null) return of(VENDORS_LOADING);
    if (!key.canRead) return of({ ...VENDORS_LOADING, state: 'forbidden' as const });
    const currentId = key.currentVendorId;
    return this.vendorRoster.listActiveVendors().pipe(
      switchMap(roster => {
        const listed = roster.vendors.find(vendor => vendor.vendorId === currentId) ?? null;
        const current$: Observable<Pick<VendorList, 'current' | 'currentStatus'>> =
          currentId === '' || listed
            ? of({ current: listed, currentStatus: 'active' as const })
            : this.vendorRoster.getVendor(currentId).pipe(
                map(vendor => ({ current: vendor, currentStatus: vendor.active ? ('active' as const) : ('inactive' as const) })),
                catchError((err: unknown) =>
                  of({
                    current: null,
                    currentStatus:
                      err instanceof HttpErrorResponse && err.status === 404 ? ('missing' as const) : ('unknown' as const),
                  }),
                ),
              );
        return current$.pipe(
          map((current): VendorList => ({ state: 'ready', vendors: roster.vendors, truncated: roster.truncated, ...current })),
        );
      }),
      catchError((err: unknown) =>
        of({
          ...VENDORS_LOADING,
          state: err instanceof HttpErrorResponse && err.status === 403 ? ('forbidden' as const) : ('error' as const),
        }),
      ),
    );
  }

  /** A choice that is no longer offered never survives into a submit. */
  private reconcileVendor(list: VendorList): void {
    const chosen = this.vendorId();
    if (chosen === '' || list.vendors.some(vendor => vendor.vendorId === chosen)) return;
    const order = this.order();
    this.vendorId.set(this.editingPoId() !== null && order ? order.supplierId : '');
  }

  private choice(vendor: SupplierVendorOption, status: CurrentVendorStatus): VendorChoice {
    const params = { number: vendor.vendorNumber, name: vendor.displayName };
    return status === 'inactive'
      ? { vendorId: vendor.vendorId, key: `${FORM}.VENDOR.OPTION_INACTIVE`, params }
      : { vendorId: vendor.vendorId, key: `${FORM}.VENDOR.OPTION`, params };
  }

  /** The edited order's own vendor, never as a raw id (ADR-0064 §5). */
  private currentChoice(vendorId: string, list: VendorList): VendorChoice {
    if (list.current) return this.choice(list.current, list.currentStatus);
    const key = list.currentStatus === 'missing' ? `${FORM}.VENDOR.CURRENT_MISSING` : `${FORM}.VENDOR.CURRENT_UNREAD`;
    return { vendorId, key, params: {} };
  }

  private resetForIdentity(): void {
    const hadFocus = this.focusInside('main');
    this.saveSeq += 1;
    this.loadSeq += 1;
    this.submitting.set(false);
    this.submitted.set(false);
    this.vendorId.set('');
    this.scheduledDeliveryDate.set('');
    this.notes.set('');
    this.revisionReason.set('');
    this.lines.set([]);
    this.availabilityCheckLineIndex.set(null);
    this.fieldErrors.set({});
    this.failureCode.set(null);
    this.errorParams.set({});
    this.vendorLocked.set(false);
    this.order.set(null);
    this.state.set('ready');
    this.errorKey.set(null);
    const poId = this.editingPoId();
    if (poId !== null) this.loadExistingPo(poId, false);
    // The form was rebuilt under the focused control: land on the page title.
    if (hadFocus) this.focusAfterRender('#po-form-title');
  }

  private settleVendorFocus(list: VendorList): void {
    if (!this.focusVendorOutcome) return;
    const settled = list.state !== 'loading';
    if (settled) this.focusVendorOutcome = false;
    this.focusAfterRender(
      !settled
        ? '[data-testid="po-vendor-loading"]'
        : list.state === 'error'
          ? '[data-testid="po-vendor-retry"]'
          : this.pickerShown()
            ? '#po-vendor'
            : '[data-testid="po-vendor-status-message"], [data-testid="po-vendor-current"]',
    );
  }

  private focusInside(selector: string): boolean {
    const active = this.document.activeElement;
    const container = this.host.nativeElement.querySelector(selector);
    return !!active && active !== this.document.body && !!container?.contains(active);
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
