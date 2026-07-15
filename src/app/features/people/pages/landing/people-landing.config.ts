import { LandingPageConfig } from '../../../../shared/landing/landing.models';

/**
 * People landing configuration consumed by the shared {@link LandingPageComponent}.
 *
 * Employee Lifecycle resolves an employee and Access & Assignments resolves a
 * person, both via the people directory name search (`getAllPeople`). The
 * directory `q` matches name, email, and username — there is no employee-number
 * search — so section hints say "Search by name". The Timekeeping section gates
 * Work Session Submit on a plain session id.
 */
export const PEOPLE_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.PEOPLE',
  titleKey: 'PEOPLE.LANDING.TITLE',
  descriptionKey: 'PEOPLE.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'PEOPLE.LANDING.HERO.OPEN_TIME_APPROVAL',
    icon: 'schedule',
    route: '/app/people/timekeeping/approval',
  },
  secondaryCta: {
    labelKey: 'PEOPLE.LANDING.HERO.CREATE_EMPLOYEE',
    route: '/app/people/employees/new',
  },
  sections: [
    {
      titleKey: 'PEOPLE.LANDING.SECTION.TIMEKEEPING.TITLE',
      descriptionKey: 'PEOPLE.LANDING.SECTION.TIMEKEEPING.DESCRIPTION',
      recordKind: 'session',
      searchHintKey: 'PEOPLE.LANDING.PLACEHOLDER.SESSION_ID',
      cards: [
        {
          kind: 'direct',
          icon: 'fact_check',
          titleKey: 'PEOPLE.LANDING.CARD.TIME_APPROVAL.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.TIME_APPROVAL.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/timekeeping/approval',
        },
        {
          kind: 'direct',
          icon: 'timer',
          titleKey: 'PEOPLE.LANDING.CARD.WORK_SESSION.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.WORK_SESSION.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/timekeeping/work-session',
        },
        {
          kind: 'guided',
          icon: 'send',
          titleKey: 'PEOPLE.LANDING.CARD.WORK_SESSION_SUBMIT.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.WORK_SESSION_SUBMIT.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_WORK_SESSION_SUBMIT',
          buildCommands: id => ['/app', 'people', 'timekeeping', 'work-session', id, 'submit'],
        },
        {
          kind: 'direct',
          icon: 'file_download',
          titleKey: 'PEOPLE.LANDING.CARD.TIME_EXPORT.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.TIME_EXPORT.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/timekeeping/export',
        },
        {
          kind: 'direct',
          icon: 'report_problem',
          titleKey: 'PEOPLE.LANDING.CARD.DISCREPANCY.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.DISCREPANCY.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/timekeeping/discrepancy',
        },
      ],
    },
    {
      titleKey: 'PEOPLE.LANDING.SECTION.EMPLOYEES.TITLE',
      descriptionKey: 'PEOPLE.LANDING.SECTION.EMPLOYEES.DESCRIPTION',
      recordKind: 'employee',
      searchHintKey: 'PEOPLE.LOOKUP.PLACEHOLDER',
      cards: [
        {
          kind: 'direct',
          icon: 'person_add',
          titleKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_NEW.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_NEW.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/employees/new',
        },
        {
          kind: 'guided',
          icon: 'badge',
          titleKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_PROFILE.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_PROFILE.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_EMPLOYEE_PROFILE',
          buildCommands: id => ['/app', 'people', 'employees', id],
        },
        {
          kind: 'guided',
          icon: 'logout',
          titleKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_OFFBOARD.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_OFFBOARD.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_EMPLOYEE_OFFBOARD',
          buildCommands: id => ['/app', 'people', 'employees', id, 'offboard'],
        },
      ],
    },
    {
      titleKey: 'PEOPLE.LANDING.SECTION.ACCESS.TITLE',
      descriptionKey: 'PEOPLE.LANDING.SECTION.ACCESS.DESCRIPTION',
      recordKind: 'person',
      searchHintKey: 'PEOPLE.LOOKUP.PLACEHOLDER',
      cards: [
        {
          kind: 'guided',
          icon: 'admin_panel_settings',
          titleKey: 'PEOPLE.LANDING.CARD.RBAC.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.RBAC.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_RBAC',
          buildCommands: id => ['/app', 'people', 'rbac', id],
        },
        {
          kind: 'guided',
          icon: 'location_on',
          titleKey: 'PEOPLE.LANDING.CARD.PERSON_LOCATIONS.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.PERSON_LOCATIONS.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PERSON_LOCATIONS',
          buildCommands: id => ['/app', 'people', 'person', id, 'locations'],
        },
      ],
    },
    {
      titleKey: 'PEOPLE.LANDING.SECTION.DATA_IMPORT.TITLE',
      descriptionKey: 'PEOPLE.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'upload_file',
          titleKey: 'PEOPLE.LANDING.CARD.IMPORT_PEOPLE.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.IMPORT_PEOPLE.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/people/bulk-import/people',
        },
      ],
    },
    {
      titleKey: 'PEOPLE.LANDING.SECTION.DIRECTORY.TITLE',
      descriptionKey: 'PEOPLE.LANDING.SECTION.DIRECTORY.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'groups',
          titleKey: 'PEOPLE.LANDING.CARD.DIRECTORY.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.DIRECTORY.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/directory',
        },
      ],
    },
    {
      titleKey: 'PEOPLE.LANDING.SECTION.COMPLIANCE.TITLE',
      descriptionKey: 'PEOPLE.LANDING.SECTION.COMPLIANCE.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'verified_user',
          titleKey: 'PEOPLE.LANDING.CARD.IDENTITY_COMPLIANCE.TITLE',
          descriptionKey: 'PEOPLE.LANDING.CARD.IDENTITY_COMPLIANCE.DESCRIPTION',
          ctaKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
          route: '/app/people/identity-compliance',
        },
      ],
    },
  ],
};
