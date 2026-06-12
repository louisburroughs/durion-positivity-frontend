import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

/**
 * Shared SKU filter input component (CAP-218 story F2, reused by F3).
 *
 * Emits a debounced {@link skuChange} event 300ms after the user stops typing.
 * Blank/whitespace-only input is normalized to `undefined` (absent filter).
 */
@Component({
  selector: 'app-sku-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './sku-filter.component.html',
  styleUrl: './sku-filter.component.css',
})
export class SkuFilterComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly inputSubject = new Subject<string>();

  /** Initial/controlled value (optional; component manages its own display state). */
  readonly initialValue = input<string>('');

  /** Fires debounced SKU value; `undefined` means filter cleared. */
  readonly skuChange = output<string | undefined>();

  readonly inputValue = signal('');

  ngOnInit(): void {
    const initial = this.initialValue();
    if (initial) {
      this.inputValue.set(initial);
    }

    this.inputSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const normalized = value.trim() || undefined;
        this.skuChange.emit(normalized);
      });
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inputValue.set(value);
    this.inputSubject.next(value);
  }

  clear(): void {
    this.inputValue.set('');
    this.inputSubject.next('');
  }
}
