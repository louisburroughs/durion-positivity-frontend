import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';
import { ClaimableService, LocationService } from '../../services/location.service';

type SearchState = 'idle' | 'loading' | 'ready' | 'failed';

/** A translation key and its parameters. */
export interface RailCaption {
  readonly key: string;
  readonly params?: Record<string, string | number>;
}

interface RailGroup {
  readonly category: string;
  readonly headingKey: string;
  readonly services: readonly ClaimableService[];
}

/** Letters typed before the catalog is searched; its search needs a term (backend#2246). */
const MIN_SEARCH_LENGTH = 2;
const CATEGORY_ORDER = ['TIRE_SERVICE', 'MAINTENANCE', 'REPAIR', 'DIAGNOSTIC'];

/**
 * The catalog services list beside the Bays and Mobile Units cards. Rows are dragged onto a card to
 * add the service; while a card's chip is being dragged, the list becomes a drop zone that removes
 * it. Every drag has a keyboard route on the cards themselves (Add service, chip ×), per ADR-0029
 * rule 13, so dragging is never the only way.
 *
 * Until the catalog can list services (backend#2246) the list starts as a search box.
 */
@Component({
  selector: 'app-service-rail',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './service-rail.component.html',
  styleUrl: './service-rail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceRailComponent {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional line under the heading, e.g. that unit capabilities are recorded, not used. */
  readonly captionKey = input<string | null>(null);
  /** i18n key describing the keyboard route, attached to every drag handle. */
  readonly keyboardRouteKey = input.required<string>();
  /** Whether rows can be dragged (the viewer can change the cards). */
  readonly draggable = input(false);
  /** Who holds each service here, shown under its row. */
  readonly describe = input<(code: string) => RailCaption | null>(() => null);
  /** Set while a card's chip is being dragged: the list then takes a drop that removes it. */
  readonly removeTarget = input<RailCaption | null>(null);

  readonly serviceDragStarted = output<ClaimableService>();
  readonly serviceDragEnded = output<void>();
  readonly removeDropped = output<void>();
  /** Services the search returned, so the page can show their names on chips. */
  readonly servicesFound = output<ClaimableService[]>();

  readonly query = signal('');
  readonly results = signal<ClaimableService[]>([]);
  readonly state = signal<SearchState>('idle');
  readonly dropHover = signal(false);
  private readonly terms = new Subject<string>();

  readonly groups = computed<RailGroup[]>(() => {
    const byCategory = new Map<string, ClaimableService[]>();
    for (const service of this.results()) {
      const category = service.operationCategory && CATEGORY_ORDER.includes(service.operationCategory)
        ? service.operationCategory
        : 'OTHER';
      byCategory.set(category, [...(byCategory.get(category) ?? []), service]);
    }
    return [...CATEGORY_ORDER, 'OTHER']
      .filter(category => byCategory.has(category))
      .map(category => ({
        category,
        headingKey: `LOCATION.SERVICE_RAIL.CATEGORY.${category}`,
        services: byCategory.get(category) ?? [],
      }));
  });

  constructor() {
    this.terms
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        filter(term => term.length >= MIN_SEARCH_LENGTH),
        switchMap(term => this.locationService.searchClaimableServices(term)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => this.apply(result));
  }

  private apply({ services, ok }: { services: ClaimableService[]; ok: boolean }): void {
    if (this.query().trim().length < MIN_SEARCH_LENGTH) return;
    this.results.set(services);
    this.state.set(ok ? 'ready' : 'failed');
    if (services.length > 0) this.servicesFound.emit(services);
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

  /** Searches the same term again; the debounced stream would drop a repeat of it. */
  retry(): void {
    const term = this.query().trim();
    if (term.length < MIN_SEARCH_LENGTH) return;
    this.state.set('loading');
    this.locationService
      .searchClaimableServices(term)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => this.apply(result));
  }

  onDragStart(service: ClaimableService, event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', service.operationCode);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    this.serviceDragStarted.emit(service);
  }

  onDragEnd(): void {
    this.serviceDragEnded.emit();
  }

  onRemoveDragOver(event: DragEvent): void {
    if (!this.removeTarget()) return;
    event.preventDefault();
    this.dropHover.set(true);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onRemoveDrop(event: DragEvent): void {
    this.dropHover.set(false);
    if (!this.removeTarget()) return;
    event.preventDefault();
    this.removeDropped.emit();
  }
}
