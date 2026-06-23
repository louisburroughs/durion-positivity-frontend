import {
  ChangeDetectionStrategy, Component, inject, signal, forwardRef, Input, DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { PeopleAPIService, Person } from '@durion-sdk/people';

const MAX_SUGGESTIONS = 12;

export type PersonLookupType = 'ALL' | 'EMPLOYEE' | 'ACTIVE' | 'INACTIVE';

/**
 * Reusable person typeahead bound as a reactive-form control. The control
 * value is the selected person id (the canonical personId / personUuid).
 *
 * Searches the people directory server-side per keystroke (debounced) via
 * the unified `q` term, which matches firstName, lastName, primaryEmail and
 * username — so there is no client-side row cap. The `type` input scopes the
 * search (e.g. EMPLOYEE-only, since a non-employee person is not tied to a
 * location).
 *
 * People who share a name are disambiguated in the dropdown by their linked
 * username and email — the Person model carries no separate employee/customer
 * number.
 *
 * If the operator types a raw id and never picks a suggestion, that text is
 * still emitted as the value, preserving the original "paste an id" workflow.
 */
@Component({
  selector: 'app-person-lookup',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './person-lookup.component.html',
  styleUrl: './person-lookup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PersonLookupComponent),
      multi: true,
    },
  ],
})
export class PersonLookupComponent implements ControlValueAccessor {
  private readonly peopleApi = inject(PeopleAPIService);
  private readonly destroyRef = inject(DestroyRef);

  /** Scopes the server-side search. EMPLOYEE excludes non-employee persons. */
  @Input() type: PersonLookupType = 'ALL';
  @Input() inputId = 'person-lookup';
  /** Translation key resolved for the field label. */
  @Input() labelKey = 'PEOPLE.LOOKUP.LABEL';
  /** Translation key resolved for the input placeholder. */
  @Input() placeholderKey = 'PEOPLE.LOOKUP.PLACEHOLDER';
  @Input() required = false;
  @Input() testId: string | null = null;
  /** When true, marks the input invalid for assistive tech. */
  @Input() invalid = false;
  /** Id of an external error element to associate via aria-describedby. */
  @Input() errorId: string | null = null;

  readonly suggestions = signal<Person[]>([]);
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
        switchMap(q => this.peopleApi.getAllPeople(this.type, q.trim() || undefined)
          .pipe(catchError(() => of([] as Person[])))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(people => {
        this.suggestions.set((people ?? []).slice(0, MAX_SUGGESTIONS));
        this.activeIndex.set(-1);
        this.loading.set(false);
      });
  }

  // Display helpers ---------------------------------------------------------
  personName(person: Person): string {
    return `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
  }

  // ControlValueAccessor ----------------------------------------------------
  writeValue(id: string | null): void {
    const next = id ?? '';
    // The value is already current (e.g. the parent echoing back a just-selected
    // id) — keep the label we already have rather than refetching it.
    if (next === this.value()) {
      return;
    }
    this.value.set(next);
    if (!next) {
      this.query.set('');
      return;
    }
    // Resolve a readable label for a pre-populated id.
    this.peopleApi.getPersonById(next)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(person => { if (person) this.query.set(this.personName(person)); });
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  // Interaction -------------------------------------------------------------
  onInput(text: string): void {
    // Keep the raw text as the value so a pasted id still resolves on launch;
    // a subsequent selection overwrites it with the canonical person id.
    this.query.set(text);
    this.value.set(text.trim());
    this.onChange(text.trim());
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

  select(person: Person): void {
    const id = person.id ?? '';
    this.value.set(id);
    this.query.set(this.personName(person));
    this.onChange(id);
    this.showList.set(false);
    this.activeIndex.set(-1);
  }
}
