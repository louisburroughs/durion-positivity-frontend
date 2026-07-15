import {
  Component, inject, signal, forwardRef, Input, DestroyRef,
} from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { AccountingService } from '../../services/accounting.service';
import { VendorDirectoryEntry } from '../../models/accounting.models';

const MAX_SUGGESTIONS = 12;

/**
 * Reusable AP vendor typeahead bound as a reactive-form control, mirroring
 * app-customer-lookup. The control value is the selected vendorId.
 *
 * Searches the AP vendor directory server-side per keystroke (debounced) via
 * GET /v1/accounting/vendors?name= (issue #816) — matching happens on the
 * backend, so there is no client-side row cap. A pre-populated id (e.g. a
 * deep-linked ?vendorId=) is resolved back to a readable name via the
 * single-vendor lookup.
 */
@Component({
  selector: 'app-vendor-lookup',
  standalone: true,
  imports: [],
  templateUrl: './vendor-lookup.component.html',
  styleUrl: './vendor-lookup.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => VendorLookupComponent),
      multi: true,
    },
  ],
})
export class VendorLookupComponent implements ControlValueAccessor {
  private readonly accounting = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() inputId = 'vendor-lookup';
  @Input() label = 'Vendor';
  @Input() required = false;
  @Input() placeholder = 'Search by vendor name…';

  readonly suggestions = signal<VendorDirectoryEntry[]>([]);
  readonly query        = signal('');
  readonly showList     = signal(false);
  readonly loading      = signal(false);
  readonly activeIndex  = signal(-1);
  readonly disabled     = signal(false);
  readonly value        = signal('');

  private primed = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly queryChanges$ = new Subject<string>();

  constructor() {
    this.queryChanges$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap(() => this.loading.set(true)),
        switchMap(q => this.accounting.searchVendors(q).pipe(catchError(() => of([] as VendorDirectoryEntry[])))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(vendors => {
        this.suggestions.set((vendors ?? []).slice(0, MAX_SUGGESTIONS));
        this.activeIndex.set(-1);
        this.loading.set(false);
      });
  }

  // ControlValueAccessor ----------------------------------------------------
  writeValue(id: string | null): void {
    const next = id ?? '';
    this.value.set(next);
    if (!next) {
      this.query.set('');
      return;
    }
    // Resolve a readable label for a pre-populated id (deep-linked ?vendorId=).
    this.accounting.getVendor(next)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(vendor => { if (vendor?.name) this.query.set(vendor.name); });
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  // Interaction -------------------------------------------------------------
  onInput(text: string): void {
    this.query.set(text);
    this.value.set('');
    this.onChange('');
    this.showList.set(true);
    this.queryChanges$.next(text);
  }

  onFocus(): void {
    this.showList.set(true);
    if (!this.primed) {
      this.primed = true;
      this.queryChanges$.next(this.query());
    }
  }

  onBlur(): void {
    this.onTouched();
    setTimeout(() => this.showList.set(false), 150);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.suggestions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.showList.set(true);
      this.activeIndex.set(Math.min(this.activeIndex() + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.activeIndex();
      if (idx >= 0 && idx < items.length) {
        event.preventDefault();
        this.select(items[idx]);
      }
    } else if (event.key === 'Escape') {
      this.showList.set(false);
      this.activeIndex.set(-1);
    }
  }

  select(vendor: VendorDirectoryEntry): void {
    const id = vendor.vendorId ?? '';
    this.value.set(id);
    this.query.set(vendor.name ?? '');
    this.onChange(id);
    this.showList.set(false);
    this.activeIndex.set(-1);
  }
}
