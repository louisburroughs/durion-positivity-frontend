import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PeopleAPIService, Person } from '@durion-sdk/people-contact';

type SortColumn = 'lastName' | 'firstName' | 'username' | 'primaryEmail';
type SortDir = 'asc' | 'desc';
type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-people-directory-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './people-directory-page.component.html',
  styleUrl: './people-directory-page.component.css',
})
export class PeopleDirectoryPageComponent implements OnInit {
  private readonly peopleApi = inject(PeopleAPIService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly allPeople = signal<Person[]>([]);
  readonly searchInputValue = signal('');
  readonly pageIndex = signal(0);
  readonly sortColumn = signal<SortColumn>('lastName');
  readonly sortDir = signal<SortDir>('asc');

  readonly sorted = computed<Person[]>(() => {
    const col = this.sortColumn();
    const dir = this.sortDir();
    return [...this.allPeople()].sort((a, b) => {
      const av = (a[col] ?? '').toLowerCase();
      const bv = (b[col] ?? '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.allPeople().length / PAGE_SIZE)),
  );

  readonly paged = computed<Person[]>(() => {
    const start = this.pageIndex() * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  private readonly searchSubject = new Subject<string>();
  private peopleSub: Subscription | null = null;

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pageIndex.set(0);
        this.loadPeople();
      });

    this.loadPeople();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchInputValue.set(value);
    this.searchSubject.next(value);
    if (!value.trim()) {
      this.pageIndex.set(0);
      this.loadPeople();
    }
  }

  clearFilters(): void {
    this.searchInputValue.set('');
    this.pageIndex.set(0);
    this.loadPeople();
  }

  reload(): void {
    this.loadPeople();
  }

  sortBy(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(col);
      this.sortDir.set('asc');
    }
  }

  ariaSort(col: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== col) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  prevPage(): void {
    if (this.pageIndex() > 0) this.pageIndex.update(p => p - 1);
  }

  nextPage(): void {
    if (this.pageIndex() < this.totalPages() - 1) this.pageIndex.update(p => p + 1);
  }

  private loadPeople(): void {
    this.peopleSub?.unsubscribe();
    this.state.set('loading');

    // Employment-type filtering left with the ADR-0044 people split: the identity
    // directory (pos-people-contact) has no employment data; HR views live under
    // the employee pages backed by pos-people.
    const q = this.searchInputValue().trim();

    this.peopleSub = this.peopleApi
      .getAllPeople(q || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: people => {
          this.allPeople.set(people);
          this.state.set(people.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
        },
      });
  }
}
