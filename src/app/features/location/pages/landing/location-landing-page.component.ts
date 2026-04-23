import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DomainType } from '../../../bulk-import/models/bulk-import.models';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';

type LaunchField = 'locationId' | 'defaultsLocationId';
type PageState = 'ready' | 'loading' | 'error';

interface DirectCard {
  readonly kind: 'direct';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly route: string;
  readonly actionKey: string;
  readonly domainType?: DomainType;
}

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly field: LaunchField;
  readonly inputLabelKey: string;
  readonly inputPlaceholderKey: string;
  readonly actionKey: string;
  readonly buildCommands: (value: string) => readonly string[];
}

interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly cards: readonly (DirectCard | LaunchCard)[];
}

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'LOCATION.LANDING.SECTION.LOCATIONS.TITLE',
    descriptionKey: 'LOCATION.LANDING.SECTION.LOCATIONS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.LOCATIONS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATIONS.DESCRIPTION',
        route: '/app/location/locations',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.DESCRIPTION',
        route: '/app/location/locations/new',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.DESCRIPTION',
        field: 'locationId',
        inputLabelKey: 'LOCATION.LANDING.FIELD.LOCATION_ID',
        inputPlaceholderKey: 'LOCATION.LANDING.PLACEHOLDER.LOCATION_ID',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_LOCATION',
        buildCommands: (value: string) => ['/app', 'location', 'locations', value],
      },
      {
        kind: 'launch',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_DEFAULTS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_DEFAULTS.DESCRIPTION',
        field: 'defaultsLocationId',
        inputLabelKey: 'LOCATION.LANDING.FIELD.DEFAULTS_LOCATION_ID',
        inputPlaceholderKey: 'LOCATION.LANDING.PLACEHOLDER.DEFAULTS_LOCATION_ID',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_LOCATION_DEFAULTS',
        buildCommands: (value: string) => ['/app', 'location', 'locations', value, 'defaults'],
      },
    ],
  },
  {
    titleKey: 'LOCATION.LANDING.SECTION.RESOURCES.TITLE',
    descriptionKey: 'LOCATION.LANDING.SECTION.RESOURCES.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.BAYS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.BAYS.DESCRIPTION',
        route: '/app/location/bays',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.DESCRIPTION',
        route: '/app/location/mobile-units',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.DESCRIPTION',
        route: '/app/location/storage-locations',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.DESCRIPTION',
        route: '/app/location/location-sync',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'LOCATION.LANDING.SECTION.DATA_IMPORT.TITLE',
    descriptionKey: 'LOCATION.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.IMPORT_LOCATION.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.IMPORT_LOCATION.DESCRIPTION',
        route: '/app/location/bulk-import/location',
        actionKey: 'LOCATION.LANDING.ACTION.IMPORT_DATA',
        domainType: 'LOCATION',
      },
    ],
  },
] as const;

@Component({
  selector: 'app-location-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './location-landing-page.component.html',
  styleUrl: './location-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationLandingPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly bulkImportService = inject(BulkImportService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeImportDomains = signal<Set<DomainType>>(new Set());
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    locationId: '',
    defaultsLocationId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;

  readonly directLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(c => c.kind === 'direct').length;
  readonly guidedLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(c => c.kind === 'launch').length;
  readonly totalPageCount = this.directLinkCount + this.guidedLinkCount;

  ngOnInit(): void {
    this.loadActiveImportDomains();
  }

  isLaunchCard(card: DirectCard | LaunchCard): card is LaunchCard {
    return card.kind === 'launch';
  }

  isActiveImport(card: DirectCard | LaunchCard): boolean {
    return card.kind === 'direct'
      && !!card.domainType
      && this.activeImportDomains().has(card.domainType);
  }

  updateLaunchValue(field: LaunchField, value: string): void {
    this.launchValues.update(prev => ({ ...prev, [field]: value }));
    this.launchErrors.update(prev => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  }

  launchValue(field: LaunchField): string {
    return this.launchValues()[field];
  }

  launchError(field: LaunchField): string | null {
    return this.launchErrors()[field] ?? null;
  }

  async openLaunch(card: LaunchCard): Promise<void> {
    const value = this.launchValues()[card.field].trim();
    if (!value) {
      this.launchErrors.update(prev => ({
        ...prev,
        [card.field]: 'LOCATION.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      return;
    }

    this.launchErrors.update(prev => {
      const { [card.field]: _cleared, ...rest } = prev;
      return rest;
    });
    this.errorKey.set(null);
    this.state.set('loading');
    this.activeLaunchField.set(card.field);

    try {
      const navigated = await this.router.navigate(card.buildCommands(value));
      if (!navigated) {
        this.state.set('error');
        this.errorKey.set('LOCATION.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('LOCATION.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }

  private loadActiveImportDomains(): void {
    if (!this.bulkImportService) {
      return;
    }

    this.bulkImportService.getActiveJobDomains()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: domains => this.activeImportDomains.set(domains),
      });
  }
}
