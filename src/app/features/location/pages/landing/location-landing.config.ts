import { LandingPageConfig } from '../../../../shared/landing/landing.models';

/**
 * Location landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing LOCATION.LANDING.* i18n keys. The Locations section resolves a
 * location record (id-only) for its guided Edit Location and Location Defaults cards.
 */
export const LOCATION_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.LOCATION',
  titleKey: 'LOCATION.LANDING.TITLE',
  descriptionKey: 'LOCATION.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'LOCATION.LANDING.HERO.OPEN_LOCATIONS',
    icon: 'add_location_alt',
    route: '/app/location/locations',
  },
  secondaryCta: {
    labelKey: 'LOCATION.LANDING.HERO.CREATE_LOCATION',
    route: '/app/location/locations/new',
  },
  sections: [
    {
      titleKey: 'LOCATION.LANDING.SECTION.LOCATIONS.TITLE',
      descriptionKey: 'LOCATION.LANDING.SECTION.LOCATIONS.DESCRIPTION',
      recordKind: 'location',
      cards: [
        {
          kind: 'direct',
          icon: 'location_on',
          titleKey: 'LOCATION.LANDING.CARD.LOCATIONS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATIONS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/locations',
        },
        {
          kind: 'direct',
          icon: 'add_location_alt',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/locations/new',
        },
        {
          kind: 'guided',
          icon: 'edit_location_alt',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_LOCATION',
          buildCommands: (id: string) => ['/app', 'location', 'locations', id],
        },
        {
          kind: 'guided',
          icon: 'tune',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_DEFAULTS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_DEFAULTS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_LOCATION_DEFAULTS',
          buildCommands: (id: string) => ['/app', 'location', 'locations', id, 'defaults'],
        },
      ],
    },
    {
      titleKey: 'LOCATION.LANDING.SECTION.RESOURCES.TITLE',
      descriptionKey: 'LOCATION.LANDING.SECTION.RESOURCES.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'garage',
          titleKey: 'LOCATION.LANDING.CARD.BAYS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.BAYS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/bays',
        },
        {
          kind: 'direct',
          icon: 'local_shipping',
          titleKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/mobile-units',
        },
        {
          kind: 'direct',
          icon: 'warehouse',
          titleKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/storage-locations',
        },
        {
          kind: 'direct',
          icon: 'sync',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/location-sync',
        },
      ],
    },
    {
      titleKey: 'LOCATION.LANDING.SECTION.DATA_IMPORT.TITLE',
      descriptionKey: 'LOCATION.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'upload_file',
          titleKey: 'LOCATION.LANDING.CARD.IMPORT_LOCATION.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.IMPORT_LOCATION.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/location/bulk-import/location',
        },
      ],
    },
  ],
};
