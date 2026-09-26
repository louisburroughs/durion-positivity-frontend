import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';
import { ClaimableService, LocationService } from '../../services/location.service';

type SearchState = 'idle' | 'loading' | 'ready' | 'failed';

/** Letters typed before the catalog is searched; its search needs a term (backend#2246). */
const MIN_SEARCH_LENGTH = 2;

/**
 * Finds catalog services by name and emits the one the user adds. The host keeps the chosen list and
 * passes it back as `selectedCodes`, so a service already chosen reads "Already added".
 */
@Component({
  selector: 'app-service-search',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './service-search.component.html',
  styleUrl: './service-search.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceSearchComponent {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Id for the search input, unique on the page. */
  readonly inputId = input.required<string>();
  /** i18n key of the input's label. */
  readonly labelKey = input.required<string>();
  readonly selectedCodes = input<readonly string[]>([]);
  readonly serviceAdded = output<ClaimableService>();

  readonly query = signal('');
  readonly results = signal<ClaimableService[]>([]);
  readonly state = signal<SearchState>('idle');
  private readonly terms = new Subject<string>();

  constructor() {
    this.terms
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        // A blank term only resets distinctUntilChanged, so retyping the same term searches again.
        filter(term => term.length >= MIN_SEARCH_LENGTH),
        switchMap(term => this.locationService.searchClaimableServices(term)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ services, ok }) => {
        if (this.query().trim().length < MIN_SEARCH_LENGTH) return;
        this.results.set(services);
        this.state.set(ok ? 'ready' : 'failed');
      });
  }

  onQuery(query: string): void {
    this.query.set(query);
    const term = query.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      this.results.set([]);
      this.state.set('idle');
      this.terms.next('');
      return;
    }
    this.state.set('loading');
    this.terms.next(term);
  }

  isSelected(code: string): boolean {
    return this.selectedCodes().includes(code);
  }

  add(service: ClaimableService): void {
    if (!this.isSelected(service.operationCode)) this.serviceAdded.emit(service);
  }
}
