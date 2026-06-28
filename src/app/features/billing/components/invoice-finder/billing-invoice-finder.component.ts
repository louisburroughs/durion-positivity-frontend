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
import { Observable, Subject, of, timer } from 'rxjs';
import { catchError, debounce, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { InvoiceFinderItem } from '../../models/billing.models';

type FinderState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

/** Per-instance id seed so multiple finders on one page keep unique DOM ids / ARIA wiring. */
let finderInstanceCounter = 0;

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

  /** Unique per-instance id prefix for input/listbox/option ids and ARIA references. */
  readonly idPrefix = `bf-finder-${finderInstanceCounter++}`;

  readonly results = signal<InvoiceFinderItem[]>([]);
  readonly state = signal<FinderState>('idle');
  readonly activeIndex = signal(-1);

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        // Read debounce/minChars lazily so @Input() overrides (bound after construction) apply.
        debounce(() => timer(this.debounceMs)),
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
    // Push every value into the stream — including sub-minChars ones — so clearing the input
    // restarts the debounce and cancels any pending result for a longer prior query (the
    // sub-minChars value is dropped by the filter, leaving the dropdown closed).
    if (value.length < this.minChars) {
      this.state.set('idle');
      this.results.set([]);
      this.activeIndex.set(-1);
    } else {
      this.state.set('loading');
    }
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

  /** The popup is shown for any non-idle state (loading/empty/error/loaded), per WAI-ARIA. */
  get expanded(): boolean {
    return this.state() !== 'idle';
  }
}
