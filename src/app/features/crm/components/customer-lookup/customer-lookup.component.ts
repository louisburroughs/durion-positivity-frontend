import {
  Component, inject, signal, forwardRef, Input, DestroyRef,
} from '@angular/core';

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';
import { partyLabel } from '../../util/crm-labels';

const MAX_SUGGESTIONS = 12;

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
  imports: [],
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
  private readonly crm = inject(CrmService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() inputId = 'customer-lookup';
  @Input() label = 'Customer';
  @Input() required = false;
  @Input() placeholder = 'Search by name or customer number…';

  readonly suggestions = signal<PartyDetail[]>([]);
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
        switchMap(q => this.crm.searchParties(q).pipe(catchError(() => of({ parties: [] as PartyDetail[] })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(res => {
        this.suggestions.set((res.parties ?? []).slice(0, MAX_SUGGESTIONS));
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
    this.crm.getParty(next)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(party => { if (party) this.query.set(partyLabel(party)); });
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

  select(party: PartyDetail): void {
    const id = party.partyId ?? '';
    this.value.set(id);
    this.query.set(partyLabel(party));
    this.onChange(id);
    this.showList.set(false);
    this.activeIndex.set(-1);
  }
}
