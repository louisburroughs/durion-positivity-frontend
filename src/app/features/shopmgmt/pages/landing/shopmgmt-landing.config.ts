import { LandingPageConfig } from '../../../../shared/landing/landing.models';

const A = (...rest: string[]) => (id: string): string[] => ['/app', 'shopmgmt', 'appointments', id, ...rest];

/**
 * Shopmgmt landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing SHOPMGMT.LANDING.* i18n keys. The Appointments section guided
 * cards resolve an appointment record (id-only kind); Dispatch & Schedule and Mechanics
 * are all direct links.
 */
export const SHOPMGMT_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.DISPATCH',
  titleKey: 'SHOPMGMT.LANDING.TITLE',
  descriptionKey: 'SHOPMGMT.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'SHOPMGMT.LANDING.HERO_CTA_DISPATCH',
    icon: 'dashboard',
    route: '/app/shopmgmt/dispatch-board',
  },
  secondaryCta: {
    labelKey: 'SHOPMGMT.LANDING.HERO_CTA_SCHEDULE',
    route: '/app/shopmgmt/schedule',
  },
  sections: [
    {
      titleKey: 'SHOPMGMT.LANDING.SECTION.DISPATCH.TITLE',
      descriptionKey: 'SHOPMGMT.LANDING.SECTION.DISPATCH.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'dashboard',
          titleKey: 'SHOPMGMT.LANDING.CARD.DISPATCH_BOARD.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.DISPATCH_BOARD.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/shopmgmt/dispatch-board',
        },
        {
          kind: 'direct',
          icon: 'calendar_month',
          titleKey: 'SHOPMGMT.LANDING.CARD.SCHEDULE.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.SCHEDULE.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/shopmgmt/schedule',
        },
      ],
    },
    {
      titleKey: 'SHOPMGMT.LANDING.SECTION.APPOINTMENTS.TITLE',
      descriptionKey: 'SHOPMGMT.LANDING.SECTION.APPOINTMENTS.DESCRIPTION',
      recordKind: 'appointment',
      cards: [
        {
          kind: 'direct',
          icon: 'event',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/shopmgmt/appointments/new',
        },
        {
          kind: 'direct',
          icon: 'event_available',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW_CRM.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW_CRM.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/shopmgmt/appointments/new/crm',
        },
        {
          kind: 'guided',
          icon: 'assignment_ind',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_ASSIGNMENT.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_ASSIGNMENT.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_ASSIGNMENT',
          buildCommands: A('assignments'),
        },
        {
          kind: 'guided',
          icon: 'edit_calendar',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_RESCHEDULE.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_RESCHEDULE.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_RESCHEDULE',
          buildCommands: A('reschedule'),
        },
        {
          kind: 'guided',
          icon: 'edit_note',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_EDIT.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_EDIT.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_EDIT',
          buildCommands: A('edit'),
        },
        {
          kind: 'guided',
          icon: 'warning',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_OVERRIDE.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_OVERRIDE.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_OVERRIDE',
          buildCommands: A('override-conflict'),
        },
        {
          kind: 'guided',
          icon: 'engineering',
          titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_DISPATCH_ASSIGN.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_DISPATCH_ASSIGN.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_DISPATCH_ASSIGN',
          buildCommands: A('dispatch-assign'),
        },
      ],
    },
    {
      titleKey: 'SHOPMGMT.LANDING.SECTION.MECHANICS.TITLE',
      descriptionKey: 'SHOPMGMT.LANDING.SECTION.MECHANICS.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'schedule',
          titleKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_AVAILABILITY.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_AVAILABILITY.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/shopmgmt/mechanics/availability',
        },
        {
          kind: 'direct',
          icon: 'groups',
          titleKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_ROSTER.TITLE',
          descriptionKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_ROSTER.DESCRIPTION',
          ctaKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/shopmgmt/mechanics/roster',
        },
      ],
    },
  ],
};
