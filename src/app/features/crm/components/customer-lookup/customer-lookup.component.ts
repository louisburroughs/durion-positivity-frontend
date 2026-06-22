import {
  Component, inject, signal, computed, forwardRef, Input, OnInit, DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';

const MAX_SUGGESTIONS = 8;

/**
 * Reusable customer typeahead bound as a reactive-form control. The control
 * value is the selected party id (the canonical customerId). Loads the CRM
 * party directory once and filters client-side by legal name, DBA, and
 * customer number — replacing raw "Customer ID" text entry across the app.
 */
@Component({
  selector: 'app-customer-lookup',
  standalone: true,
  imports: [CommonModule],
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
export class CustomerLookupComponent implements OnInit, ControlValueAccessor {
  private readonly crm = inject(CrmService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() inputId = 'customer-lookup';
  @Input() label = 'Customer';
  @Input() required = false;
  @Input() placeholder = 'Search by name or customer number…';

  readonly allCustomers = signal<PartyDetail[]>([]);
  readonly query        = signal('');
  readonly showList     = signal(false);
  readonly activeIndex  = signal(-1);
  readonly disabled     = signal(false);
  readonly value        = signal('');

  private pendingId: string | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  readonly suggestions = computed<PartyDetail[]>(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.allCustomers();
    if (!q) return all.slice(0, MAX_SUGGESTIONS);
    return all.filter(p => {
      const name = (p.legalName ?? '').toLowerCase();
      const dba = (p.dba ?? '').toLowerCase();
      const num = (p.customerNumber ?? '').toLowerCase();
      return name.includes(q) || dba.includes(q) || num.includes(q);
    }).slice(0, MAX_SUGGESTIONS);
  });

  ngOnInit(): void {
    this.crm.browseParties({ page: 0, size: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          this.allCustomers.set(page.parties ?? []);
          if (this.pendingId) {
            this.applyDisplayForId(this.pendingId);
            this.pendingId = null;
          }
        },
        error: () => {},
      });
  }

  // ControlValueAccessor ----------------------------------------------------
  writeValue(id: string | null): void {
    const next = id ?? '';
    this.value.set(next);
    if (!next) {
      this.query.set('');
    } else if (this.allCustomers().length > 0) {
      this.applyDisplayForId(next);
    } else {
      this.pendingId = next;
    }
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  // Interaction -------------------------------------------------------------
  onInput(text: string): void {
    this.query.set(text);
    this.value.set('');
    this.onChange('');
    this.activeIndex.set(-1);
    this.showList.set(true);
  }

  onFocus(): void {
    if (this.allCustomers().length > 0) this.showList.set(true);
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
    this.query.set(this.labelFor(party));
    this.onChange(id);
    this.showList.set(false);
    this.activeIndex.set(-1);
  }

  labelFor(party: PartyDetail): string {
    const num = party.customerNumber ? ` · ${party.customerNumber}` : '';
    return party.dba ? `${party.legalName} (${party.dba})${num}` : `${party.legalName}${num}`;
  }

  private applyDisplayForId(id: string): void {
    const party = this.allCustomers().find(p => p.partyId === id);
    if (party) this.query.set(this.labelFor(party));
  }
}
