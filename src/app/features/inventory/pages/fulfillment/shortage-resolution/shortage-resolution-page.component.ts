import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, of } from 'rxjs';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import {
  ShortageOption,
  ShortageResolutionResult,
  WorkorderReservation,
  WorkorderReservationAllocation,
} from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type OptionsState = 'idle' | 'loading' | 'ready' | 'error';

/** The allocation the options are computed for, with the line it belongs to. */
interface SelectedAllocation {
  readonly reservation: WorkorderReservation;
  readonly allocation: WorkorderReservationAllocation;
}

/** Option types with copy of their own. Literal so the i18n check sees them. */
const OPTION_KEYS: Readonly<Record<string, string>> = {
  BACKORDER: 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.OPTION.BACKORDER',
  SUBSTITUTE: 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.OPTION.SUBSTITUTE',
  TRANSFER_IN: 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.OPTION.TRANSFER_IN',
  EMERGENCY_PURCHASE: 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.OPTION.EMERGENCY_PURCHASE',
  CANCEL_LINE: 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.OPTION.CANCEL_LINE',
};

/**
 * Shortage resolution for a workorder (CAP-220 #89, issue #422).
 *
 * Lists the workorder's line reservations that are short (`shortQuantity > 0`, as served by
 * `listReservationsForWorkorder`, backend #2233). Choosing one of a line's allocations reads the
 * live options for it (`listShortageOptions`); the server derives the SKU and short quantity
 * from the allocation, and offers SUBSTITUTE and TRANSFER_IN only with a location, which the
 * page sends from the allocation. Confirming one option calls `resolveShortage`, which is
 * idempotent per allocation and option, then re-reads the reservations.
 *
 * `?allocationId=` preselects an allocation, for links that already name one.
 *
 * Authorization (ADR-0040 §6a.1): the route admits `inventory:shortage:view`, which both reads
 * enforce; the confirm control and its handler gate on `inventory:shortage:resolve`.
 */
@Component({
  selector: 'app-shortage-resolution-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink, DatePipe, DecimalPipe, MoneyPipe],
  templateUrl: './shortage-resolution-page.component.html',
  styleUrls: ['./shortage-resolution-page.component.css'],
})
export class ShortageResolutionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly inventory = inject(InventoryDomainService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly reservations = signal<readonly WorkorderReservation[]>([]);
  /** Location names by id; a failed read leaves names unavailable, never shows an id (ADR-0064). */
  readonly locationNames = signal<ReadonlyMap<string, string>>(new Map());

  readonly selected = signal<SelectedAllocation | null>(null);
  readonly optionsState = signal<OptionsState>('idle');
  readonly optionsErrorKey = signal<string | null>(null);
  readonly options = signal<readonly ShortageOption[]>([]);
  readonly selectedOption = signal<ShortageOption | null>(null);
  readonly notes = signal('');

  readonly resolving = signal(false);
  readonly resolveErrorKey = signal<string | null>(null);
  readonly result = signal<ShortageResolutionResult | null>(null);

  /** Short lines only, as the server computed them; the page adds nothing up. */
  readonly shortLines = computed(() => this.reservations().filter(row => (row.shortQuantity ?? 0) > 0));

  /** `resolveShortage` enforces `inventory:shortage:resolve`; unknown permissions fall back as `canAccess()` does. */
  readonly canResolve = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(INVENTORY_PAGE.shortageResolve),
  );

  private readonly resultRegion = viewChild<ElementRef<HTMLElement>>('resultRegion');

  private workorderId = '';
  /** One counter per writer (ADR-0063): the reservations, and the options of the chosen allocation. */
  private readSeq = 0;
  private optionsSeq = 0;
  private optionsSub: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.optionsSub?.unsubscribe());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.workorderId = params.get('workorderId') ?? '';
      this.clearSelection();
      this.result.set(null);
      this.load();
    });
    this.inventory
      .getLocations()
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(locations =>
        this.locationNames.set(new Map(locations.filter(l => l.locationId && l.name).map(l => [l.locationId, l.name]))),
      );
  }

  load(): void {
    const seq = ++this.readSeq;
    if (!this.workorderId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.MISSING_ID');
      return;
    }
    this.state.set('loading');
    this.errorKey.set(null);
    this.inventory
      .getWorkorderReservations(this.workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: reservations => {
          if (seq !== this.readSeq) return;
          this.reservations.set(reservations);
          this.state.set('ready');
          this.errorKey.set(null);
          this.preselect();
        },
        error: (error: unknown) => {
          if (seq !== this.readSeq) return;
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set(
            error instanceof HttpErrorResponse && error.status === 403
              ? 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.FORBIDDEN'
              : 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.LOAD_RESERVATIONS',
          );
        },
      });
  }

  locationName(locationId: string | null | undefined): string | null {
    return locationId ? (this.locationNames().get(locationId) ?? null) : null;
  }

  optionKey(optionType: string): string {
    return OPTION_KEYS[optionType] ?? 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.OPTION.OTHER';
  }

  isSelected(allocation: WorkorderReservationAllocation): boolean {
    return this.selected()?.allocation.allocationId === allocation.allocationId;
  }

  /** Reads the live options for one allocation; a newer choice supersedes an older read (ADR-0063). */
  selectAllocation(reservation: WorkorderReservation, allocation: WorkorderReservationAllocation): void {
    if (this.resolving()) return;
    this.selected.set({ reservation, allocation });
    this.selectedOption.set(null);
    this.resolveErrorKey.set(null);
    this.result.set(null);
    this.readOptions();
  }

  retryOptions(): void {
    this.readOptions();
  }

  selectOption(option: ShortageOption): void {
    if (this.resolving()) return;
    this.selectedOption.set(option);
    this.resolveErrorKey.set(null);
  }

  /** Executes the chosen option; the handler re-checks the write permission (ADR-0040 §6a.1). */
  resolve(): void {
    const selection = this.selected();
    const option = this.selectedOption();
    if (!selection || !option || this.resolving() || !this.canResolve()) return;

    this.resolving.set(true);
    this.resolveErrorKey.set(null);
    this.inventory
      .resolveShortage({
        allocationId: selection.allocation.allocationId,
        optionType: option.optionType,
        workorderLineId: selection.reservation.workorderLineId ?? undefined,
        locationId: selection.allocation.locationId ?? undefined,
        sourceLocationId: option.sourceLocationId,
        substituteSku: option.substituteSku,
        notes: this.notes().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.resolving.set(false);
          this.result.set(result);
          this.clearSelection();
          // The shortage changed: re-read the lines, and move focus to the outcome.
          this.load();
          afterNextRender(() => this.resultRegion()?.nativeElement.focus(), { injector: this.injector });
        },
        error: (error: unknown) => {
          this.resolving.set(false);
          this.resolveErrorKey.set(resolveErrorKey(error));
        },
      });
  }

  private readOptions(): void {
    const selection = this.selected();
    if (!selection) return;
    const seq = ++this.optionsSeq;
    this.optionsSub?.unsubscribe();
    this.optionsState.set('loading');
    this.optionsErrorKey.set(null);
    this.options.set([]);
    // sku and shortQuantity are left out: the server derives them from the allocation.
    this.optionsSub = this.inventory
      .getShortageOptions(
        selection.allocation.allocationId,
        undefined,
        undefined,
        selection.reservation.workorderLineId ?? undefined,
        selection.allocation.locationId ?? undefined,
      )
      .subscribe({
        next: options => {
          if (seq !== this.optionsSeq) return;
          this.options.set(options);
          this.optionsState.set('ready');
        },
        error: (error: unknown) => {
          if (seq !== this.optionsSeq) return;
          this.optionsState.set('error');
          this.optionsErrorKey.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.ALLOCATION_NOT_FOUND'
              : 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.LOAD',
          );
        },
      });
  }

  /** `?allocationId=` names an allocation to start from, when a link already knows it. */
  private preselect(): void {
    if (this.selected()) return;
    const wanted = this.route.snapshot.queryParamMap.get('allocationId');
    if (!wanted) return;
    for (const reservation of this.shortLines()) {
      const allocation = reservation.allocations.find(candidate => candidate.allocationId === wanted);
      if (allocation) {
        this.selectAllocation(reservation, allocation);
        return;
      }
    }
  }

  private clearSelection(): void {
    this.optionsSeq++;
    this.optionsSub?.unsubscribe();
    this.selected.set(null);
    this.options.set([]);
    this.optionsState.set('idle');
    this.selectedOption.set(null);
    this.notes.set('');
  }
}

/**
 * The message for a refused resolution (backend #2206): 404 when the allocation no longer
 * exists, 422 when the option's preconditions fail or the derived shortage is no longer
 * positive, 403 without `inventory:shortage:resolve`, 400 for a malformed request.
 */
function resolveErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 400:
        return 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.VALIDATION';
      case 403:
        return 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.FORBIDDEN_RESOLVE';
      case 404:
        return 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.ALLOCATION_NOT_FOUND';
      case 409:
      case 422:
        return 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.NOT_RESOLVABLE';
    }
  }
  return 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.SUBMIT';
}
