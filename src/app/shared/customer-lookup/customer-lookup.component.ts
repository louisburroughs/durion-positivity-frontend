import { Component, inject, signal, forwardRef, Input, DestroyRef } from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { CUSTOMER_LOOKUP_SOURCE, CustomerLookupResult } from './customer-lookup.tokens';

const MAX_SUGGESTIONS = 12;

/**
 * Canonical customer display label: "Legal Name (DBA) · CUST-NUMBER",
 * omitting the DBA and/or number segments when absent. Mirrors `crm`'s
 * `partyLabel` (features/crm/utils/crm-labels.ts); duplicated here in miniature
 * so `shared/customer-lookup` never depends on `features/crm` (LAY-02).
 */
function formatLabel(result: CustomerLookupResult): string {
  const num = result.customerNumber ? ` · ${result.customerNumber}` : '';
  return result.dba ? `${result.legalName} (${result.dba})${num}` : `${result.legalName}${num}`;
}

/**
 * Reusable customer typeahead bound as a reactive-form control. The control
 * value is the selected party id (the canonical customerId).
 *
 * Searches the customer directory server-side per keystroke (debounced) via
 * the unified browse term, which matches legal/display name and customer
 * number — so there is no client-side row cap.
 */
@Component({
  selector: 'app-customer-lookup',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './customer-lookup.component.html',
  styleUrl: './customer-lookup.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomerLookupComponent),
      multi: true,
    },
  ],
})
export class CustomerLookupComponent implements ControlValueAccessor {
  private readonly lookupSource = inject(CUSTOMER_LOOKUP_SOURCE);
  private readonly destroyRef = inject(DestroyRef);

  @Input() inputId = 'customer-lookup';
  /**
   * Left undefined by default so the template falls back to the component's own
   * key through `| translate`. Resolving the default here with `instant` would
   * freeze it at construction time — before the loader has the catalogue on a
   * cold start, and stale forever after a runtime locale switch.
   */
  @Input() label?: string;
  @Input() required = false;
  @Input() placeholder?: string;

  readonly suggestions = signal<CustomerLookupResult[]>([]);
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
        switchMap(q => this.lookupSource.search(q).pipe(catchError(() => of([] as CustomerLookupResult[])))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(res => {
        this.suggestions.set((res ?? []).slice(0, MAX_SUGGESTIONS));
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
    // Resolve a readable label for a pre-populated id.
    this.lookupSource.getById(next)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(result => { if (result) this.query.set(formatLabel(result)); });
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

  select(party: CustomerLookupResult): void {
    const id = party.partyId ?? '';
    this.value.set(id);
    this.query.set(formatLabel(party));
    this.onChange(id);
    this.showList.set(false);
    this.activeIndex.set(-1);
  }
}
