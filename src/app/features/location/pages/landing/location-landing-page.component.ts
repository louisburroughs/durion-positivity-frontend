import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField = 'locationId' | 'defaultsLocationId';
type PageState = 'ready' | 'loading' | 'error';

interface DirectCard {
  readonly kind: 'direct';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly routePattern: string;
  readonly route: string;
  readonly actionKey: string;
}

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly routePattern: string;
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
        routePattern: '/app/location/locations',
        route: '/app/location/locations',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.DESCRIPTION',
        routePattern: '/app/location/locations/new',
        route: '/app/location/locations/new',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.DESCRIPTION',
        routePattern: '/app/location/locations/:id',
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
        routePattern: '/app/location/locations/:locationId/defaults',
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
        routePattern: '/app/location/bays',
        route: '/app/location/bays',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.DESCRIPTION',
        routePattern: '/app/location/mobile-units',
        route: '/app/location/mobile-units',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.DESCRIPTION',
        routePattern: '/app/location/storage-locations',
        route: '/app/location/storage-locations',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.TITLE',
        descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.DESCRIPTION',
        routePattern: '/app/location/location-sync',
        route: '/app/location/location-sync',
        actionKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
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
export class LocationLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
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

  isLaunchCard(card: DirectCard | LaunchCard): card is LaunchCard {
    return card.kind === 'launch';
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
}
