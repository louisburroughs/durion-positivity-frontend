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
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { MaterialSymbolPipe } from '../../material-symbol.pipe';
import { RecordHit, RecordSearchFn } from '../landing.models';

type FinderState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

/** Per-instance seed so multiple finders on one page keep unique DOM ids / ARIA wiring. */
let finderInstanceCounter = 0;

/**
 * Accessible section-level record finder used by every landing page.
 *
 * - `mode="search"` (default): debounces input, calls the injected `search` fn,
 *   renders a WAI-ARIA 1.2 combobox/listbox, emits the chosen record id.
 * - `mode="id"`: plain identifier input (no lookup); emits the trimmed value on
 *   Enter or blur. Used by id-only record kinds.
 *
 * Keyboard-navigable (ArrowUp/Down/Enter/Escape).
 */
@Component({
  selector: 'app-landing-record-finder',
  standalone: true,
  imports: [TranslatePipe, MaterialSymbolPipe],
  templateUrl: './landing-record-finder.component.html',
  styleUrl: './landing-record-finder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingRecordFinderComponent {
  private readonly destroyRef = inject(DestroyRef);

  @Input() label = '';
  @Input() placeholder = '';
  @Input() mode: 'search' | 'id' = 'search';
  /** Required when mode === 'search'. */
  @Input() search?: RecordSearchFn;
  @Input() minChars = 2;
  @Input() debounceMs = 250;

  /** Emits the selected/entered record id. */
  @Output() selected = new EventEmitter<string>();
  /** Emits when the selection is cleared (Escape / emptied). */
  @Output() cleared = new EventEmitter<void>();

  readonly idPrefix = `landing-finder-${finderInstanceCounter++}`;

  readonly results = signal<RecordHit[]>([]);
  readonly state = signal<FinderState>('idle');
  readonly activeIndex = signal(-1);
  /** The currently committed value (chosen hit id or entered identifier). */
  readonly value = signal('');

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(this.debounceMs),
        distinctUntilChanged(),
        filter(q => q.length >= this.minChars),
        switchMap(q => {
          const fn = this.search;
          if (!fn) {
            return of([] as RecordHit[]);
          }
          return fn(q).pipe(
            catchError(() => {
              this.state.set('error');
              return of([] as RecordHit[]);
            }),
          );
        }),
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

  onInput(raw: string): void {
    if (this.mode === 'id') {
      // No lookup — committing happens on Enter/blur.
      return;
    }
    if (raw.length < this.minChars) {
      this.state.set('idle');
      this.results.set([]);
      this.activeIndex.set(-1);
      return;
    }
    this.state.set('loading');
    this.query$.next(raw);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.mode === 'id') {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitId((event.target as HTMLInputElement).value);
      } else if (event.key === 'Escape') {
        this.clearSelection();
      }
      return;
    }

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
        this.clearSelection();
        break;
      default:
        break;
    }
  }

  onBlur(raw: string): void {
    if (this.mode === 'id') {
      this.commitId(raw);
    }
  }

  choose(item: RecordHit): void {
    this.value.set(item.id);
    this.selected.emit(item.id);
    this.closeList();
  }

  private commitId(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) {
      this.clearSelection();
      return;
    }
    this.value.set(trimmed);
    this.selected.emit(trimmed);
  }

  clearSelection(): void {
    this.value.set('');
    this.closeList();
    this.cleared.emit();
  }

  private closeList(): void {
    this.results.set([]);
    this.activeIndex.set(-1);
    this.state.set('idle');
  }

  get filled(): boolean {
    return this.value().trim().length > 0;
  }

  get expanded(): boolean {
    // The listbox popup is displayed whenever it has content — results OR a
    // loading/empty/error status message — so aria-expanded must reflect that.
    return this.mode === 'search' && this.state() !== 'idle';
  }
}
