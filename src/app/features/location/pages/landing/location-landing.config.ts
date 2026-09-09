import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { LandingPageConfig } from '../../../../shared/landing/landing.models';

/**
 * Location landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing LOCATION.LANDING.* i18n keys. The Locations section resolves a
 * location record (id-only) for its guided Edit Location and Location Defaults cards.
 */
/**
 * Every card carries the same access requirement as the route it opens, so the
 * shared landing component can drop the ones this session's permissions would
 * bounce at the guard. Keep the two in step — `core/security/page-access.spec.ts`
 * fails the build when a card and its route disagree.
 */
export const LOCATION_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.LOCATION',
  titleKey: 'LOCATION.LANDING.TITLE',
  descriptionKey: 'LOCATION.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'LOCATION.LANDING.HERO.OPEN_LOCATIONS',
    icon: 'add_location_alt',
    route: '/app/location/locations',
    permissions: LOCATION_PAGE.locationView,
  },
  secondaryCta: {
    labelKey: 'LOCATION.LANDING.HERO.CREATE_LOCATION',
    route: '/app/location/locations/new',
    permissions: LOCATION_PAGE.locationCreate,
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
          permissions: LOCATION_PAGE.locationView,
        },
        {
          kind: 'direct',
          icon: 'add_location_alt',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_NEW.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/locations/new',
          permissions: LOCATION_PAGE.locationCreate,
        },
        {
          kind: 'guided',
          icon: 'edit_location_alt',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_EDIT.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_LOCATION',
          buildCommands: (id: string) => ['/app', 'location', 'locations', id],
          permissions: LOCATION_PAGE.locationView,
        },
        {
          kind: 'guided',
          icon: 'tune',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_DEFAULTS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_DEFAULTS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_LOCATION_DEFAULTS',
          buildCommands: (id: string) => ['/app', 'location', 'locations', id, 'defaults'],
          permissions: LOCATION_PAGE.locationView,
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
          permissions: LOCATION_PAGE.bays,
        },
        {
          kind: 'direct',
          icon: 'local_shipping',
          titleKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.MOBILE_UNITS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/mobile-units',
          permissions: LOCATION_PAGE.mobileUnits,
        },
        {
          kind: 'direct',
          icon: 'warehouse',
          titleKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.STORAGE_LOCATIONS.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/storage-locations',
          permissions: LOCATION_PAGE.locationView,
        },
        {
          kind: 'direct',
          icon: 'sync',
          titleKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.TITLE',
          descriptionKey: 'LOCATION.LANDING.CARD.LOCATION_SYNC.DESCRIPTION',
          ctaKey: 'LOCATION.LANDING.ACTION.OPEN_PAGE',
          route: '/app/location/location-sync',
          permissions: LOCATION_PAGE.sync,
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
          permissions: LOCATION_PAGE.bulkImport,
        },
      ],
    },
  ],
};
