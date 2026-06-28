import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { InvoiceFinderItem } from '../../models/billing.models';

type FinderState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Accessible, reusable invoice finder. Debounces input, calls the injected `search`
 * function (matching customer name, invoice number, or workorder number) and emits the
 * selected invoice id. Keyboard-navigable (ArrowUp/Down/Enter/Escape) combobox + listbox
 * per WAI-ARIA 1.2.
 */
@Component({
  selector: 'app-billing-invoice-finder',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './billing-invoice-finder.component.html',
  styleUrl: './billing-invoice-finder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingInvoiceFinderComponent {
  private readonly destroyRef = inject(DestroyRef);

  @Input() label = '';
  @Input() placeholder = '';
  @Input() search!: (q: string) => Observable<InvoiceFinderItem[]>;
  @Input() minChars = 2;
  @Input() debounceMs = 250;

  @Output() selected = new EventEmitter<string>();

  readonly results = signal<InvoiceFinderItem[]>([]);
  readonly state = signal<FinderState>('idle');
  readonly activeIndex = signal(-1);

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(this.debounceMs),
        distinctUntilChanged(),
        filter(q => q.length >= this.minChars),
        switchMap(q =>
          this.search(q).pipe(
            catchError(() => {
              this.state.set('error');
              return of([] as InvoiceFinderItem[]);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(items => {
        if (this.state() === 'error') {
          this.results.set([]);
          this.activeIndex.set(-1);
          return;
        }
        this.results.set(items);
        this.activeIndex.set(-1);
        this.state.set(items.length === 0 ? 'empty' : 'loaded');
      });
  }

  onInput(value: string): void {
    if (value.length < this.minChars) {
      this.state.set('idle');
      this.results.set([]);
      this.activeIndex.set(-1);
      return;
    }
    this.state.set('loading');
    this.query$.next(value);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.results();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (items.length) {
          this.activeIndex.set(Math.min(this.activeIndex() + 1, items.length - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (items.length) {
          this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
        }
        break;
      case 'Enter': {
        const idx = this.activeIndex();
        if (idx >= 0 && idx < items.length) {
          event.preventDefault();
          this.choose(items[idx]);
        }
        break;
      }
      case 'Escape':
        this.clear();
        break;
      default:
        break;
    }
  }

  choose(item: InvoiceFinderItem): void {
    this.selected.emit(item.id);
    this.clear();
  }

  private clear(): void {
    this.results.set([]);
    this.activeIndex.set(-1);
    this.state.set('idle');
  }

  get expanded(): boolean {
    return this.results().length > 0;
  }
}
