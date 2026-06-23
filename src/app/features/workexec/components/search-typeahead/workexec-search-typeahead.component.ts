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
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
} from 'rxjs/operators';
import { SearchResultItem } from '../../models/workexec.models';

type TypeaheadState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Accessible, reusable typeahead finder. Debounces input, calls the injected
 * `search` function, and emits the selected record id. Keyboard-navigable
 * (ArrowUp/Down/Enter/Escape) combobox + listbox per WAI-ARIA.
 */
@Component({
  selector: 'app-workexec-search-typeahead',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './workexec-search-typeahead.component.html',
  styleUrl: './workexec-search-typeahead.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkexecSearchTypeaheadComponent {
  private readonly destroyRef = inject(DestroyRef);

  @Input() label = '';
  @Input() placeholder = '';
  @Input() search!: (q: string) => Observable<SearchResultItem[]>;
  @Input() minChars = 2;
  @Input() debounceMs = 250;

  @Output() selected = new EventEmitter<string>();

  readonly results = signal<SearchResultItem[]>([]);
  readonly state = signal<TypeaheadState>('idle');
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
              return of([] as SearchResultItem[]);
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

  choose(item: SearchResultItem): void {
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
