import { LandingPageConfig } from '../../../../shared/landing/landing.models';

const party = (...rest: string[]) => (id: string): string[] => ['/app', 'crm', 'party', id, ...rest];

/**
 * CRM landing configuration consumed by the shared {@link LandingPageComponent}.
 * The Party and Insights sections resolve a customer via the shared customer
 * finder (unified commercial + individual name search), keyed by party UUID.
 */
export const CRM_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.CRM',
  titleKey: 'CRM.LANDING.TITLE',
  descriptionKey: 'CRM.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'CRM.LANDING.HERO.OPEN_CUSTOMERS',
    icon: 'groups',
    route: '/app/crm/customers',
  },
  secondaryCta: {
    labelKey: 'CRM.LANDING.HERO.CREATE_ACCOUNT',
    route: '/app/crm/create-commercial-account',
  },
  sections: [
    {
      titleKey: 'CRM.LANDING.SECTION.DIRECTORY.TITLE',
      descriptionKey: 'CRM.LANDING.SECTION.DIRECTORY.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'groups',
          titleKey: 'CRM.LANDING.CARD.CUSTOMER_LIST.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.CUSTOMER_LIST.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
          route: '/app/crm/customers',
        },
        {
          kind: 'direct',
          icon: 'domain_add',
          titleKey: 'CRM.LANDING.CARD.CREATE_COMMERCIAL.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.CREATE_COMMERCIAL.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
          route: '/app/crm/create-commercial-account',
        },
        {
          kind: 'direct',
          icon: 'person_add',
          titleKey: 'CRM.LANDING.CARD.CREATE_INDIVIDUAL.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.CREATE_INDIVIDUAL.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
          route: '/app/crm/create-individual-person',
        },
        {
          kind: 'direct',
          icon: 'merge',
          titleKey: 'CRM.LANDING.CARD.MERGE_PARTIES.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.MERGE_PARTIES.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
          route: '/app/crm/merge-parties',
        },
      ],
    },
    {
      titleKey: 'CRM.LANDING.SECTION.PARTY.TITLE',
      descriptionKey: 'CRM.LANDING.SECTION.PARTY.DESCRIPTION',
      recordKind: 'customer',
      cards: [
        {
          kind: 'guided',
          icon: 'badge',
          titleKey: 'CRM.LANDING.CARD.PARTY_DETAIL.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.PARTY_DETAIL.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PARTY',
          buildCommands: party(),
        },
        {
          kind: 'guided',
          icon: 'directions_car',
          titleKey: 'CRM.LANDING.CARD.ADD_VEHICLE.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.ADD_VEHICLE.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_VEHICLE_FORM',
          buildCommands: party('add-vehicle'),
        },
        {
          kind: 'guided',
          icon: 'contacts',
          titleKey: 'CRM.LANDING.CARD.PARTY_CONTACTS.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.PARTY_CONTACTS.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_CONTACTS',
          buildCommands: party('contacts'),
        },
        {
          kind: 'guided',
          icon: 'rule',
          titleKey: 'CRM.LANDING.CARD.BILLING_RULES.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.BILLING_RULES.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_BILLING_RULES',
          buildCommands: party('billing-rules'),
        },
      ],
    },
    {
      titleKey: 'CRM.LANDING.SECTION.INSIGHTS.TITLE',
      descriptionKey: 'CRM.LANDING.SECTION.INSIGHTS.DESCRIPTION',
      recordKind: 'customer',
      cards: [
        {
          kind: 'direct',
          icon: 'insights',
          titleKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
          route: '/app/crm/snapshot',
        },
        {
          kind: 'guided',
          icon: 'person_search',
          titleKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT_PARTY.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT_PARTY.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_SNAPSHOT',
          buildCommands: id => ['/app', 'crm', 'crm-snapshot', id],
        },
        {
          kind: 'direct',
          icon: 'sync_alt',
          titleKey: 'CRM.LANDING.CARD.INTEGRATION_EVENTS.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.INTEGRATION_EVENTS.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
          route: '/app/crm/integration/events',
        },
      ],
    },
    {
      titleKey: 'CRM.LANDING.SECTION.DATA_IMPORT.TITLE',
      descriptionKey: 'CRM.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'upload_file',
          titleKey: 'CRM.LANDING.CARD.IMPORT_CUSTOMER.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.IMPORT_CUSTOMER.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/crm/bulk-import/customer',
        },
        {
          kind: 'direct',
          icon: 'directions_car',
          titleKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_INVENTORY.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_INVENTORY.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/crm/bulk-import/vehicle-inventory',
        },
        {
          kind: 'direct',
          icon: 'build',
          titleKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_FITMENT.TITLE',
          descriptionKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_FITMENT.DESCRIPTION',
          ctaKey: 'CRM.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/crm/bulk-import/vehicle-fitment',
        },
      ],
    },
  ],
};
