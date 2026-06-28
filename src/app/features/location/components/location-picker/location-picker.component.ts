
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

interface PickerLocation {
  id: string;
  name?: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  mailingAddress?: string;
}

let pickerSeq = 0;

@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './location-picker.component.html',
  styleUrl: './location-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationPickerComponent implements OnDestroy {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  // Optional overrides; when unset the template resolves translated fallbacks.
  @Input() label?: string;
  @Input() placeholder?: string;
  @Input() errorText?: string;

  private readonly _selectedId = signal('');
  @Input() set selectedId(value: string | null | undefined) {
    this._selectedId.set(value ?? '');
  }

  @Output() readonly locationSelected = new EventEmitter<string>();
  @Output() readonly invalidSelection = new EventEmitter<string>();

  private readonly seq = ++pickerSeq;
  readonly inputId = `location-picker-input-${this.seq}`;
  readonly listId = `location-picker-list-${this.seq}`;

  readonly all = signal<PickerLocation[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal(false);
  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(-1);
  private readonly typed = signal(false);
  private readonly lastInvalidEmitted = signal('');
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  readonly displayValue = computed(() => {
    if (this.typed()) {
      return this.query();
    }
    const id = this._selectedId();
    const match = this.all().find(l => l.id === id);
    return match ? (match.name || match.code || '') : '';
  });

  readonly suggestions = computed<PickerLocation[]>(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.all();
    if (!q) {
      return list.slice(0, 50);
    }
    return list
      .filter(l =>
        (l.name ?? '').toLowerCase().includes(q) ||
        (l.code ?? '').toLowerCase().includes(q) ||
        this.addressOf(l).toLowerCase().includes(q),
      )
      .slice(0, 50);
  });

  constructor() {
    this.locationService.getAllLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.all.set((rows as PickerLocation[]).filter(r => !!r?.id));
          this.loadError.set(false);
          this.loaded.set(true);
        },
        error: () => {
          this.loadError.set(true);
          this.loaded.set(true);
        },
      });

    // Validate selectedId once locations are loaded.
    effect(() => {
      const id = this._selectedId();
      if (!this.loaded() || !id || this.typed()) {
        return;
      }
      if (!this.all().some(l => l.id === id)) {
        if (this.lastInvalidEmitted() !== id) {
          this.lastInvalidEmitted.set(id);
          this.invalidSelection.emit(id);
        }
      }
    });
  }

  addressOf(loc: PickerLocation): string {
    if (loc.mailingAddress && loc.mailingAddress.trim()) {
      return loc.mailingAddress.trim();
    }
    return [loc.addressLine1, loc.city, loc.state].filter(Boolean).join(', ');
  }

  onInput(value: string): void {
    if (!value.trim()) {
      this.typed.set(true);
      this.query.set('');
      this.open.set(true);
      this.activeIndex.set(-1);
      this._selectedId.set('');
      this.lastInvalidEmitted.set('');
      this.locationSelected.emit('');
      return;
    }
    this.typed.set(true);
    this.query.set(value);
    this.open.set(true);
    this.activeIndex.set(-1);
  }

  onFocus(): void {
    if (this.all().length > 0) {
      this.open.set(true);
    }
  }

  onBlur(): void {
    if (this.blurTimer !== null) {
      clearTimeout(this.blurTimer);
    }
    this.blurTimer = setTimeout(() => {
      this.open.set(false);
      this.blurTimer = null;
    }, 150);
  }

  ngOnDestroy(): void {
    if (this.blurTimer !== null) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.suggestions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
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
      this.open.set(false);
    }
  }

  select(loc: PickerLocation): void {
    this.typed.set(false);
    this.query.set('');
    this._selectedId.set(loc.id);
    this.lastInvalidEmitted.set('');
    this.loadError.set(false);
    this.open.set(false);
    this.activeIndex.set(-1);
    this.locationSelected.emit(loc.id);
  }
}
