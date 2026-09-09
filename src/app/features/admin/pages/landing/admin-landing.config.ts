import { BULK_IMPORT_PAGE, SECURITY_PAGE } from '../../../../core/security/route-permissions';
import { LandingPageConfig } from '../../../../shared/landing/landing.models';

/**
 * Admin landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing ADMIN.LANDING.* i18n keys. The Roles & Permissions section
 * resolves a role record (id-only selector) for its guided Role Detail card.
 */
/**
 * Every card carries the same access requirement as the route it opens, so the
 * shared landing component can drop the ones this session's permissions would
 * bounce at the guard. Keep the two in step — `core/security/page-access.spec.ts`
 * fails the build when a card and its route disagree.
 */
export const ADMIN_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.ADMIN',
  titleKey: 'ADMIN.LANDING.TITLE',
  descriptionKey: 'ADMIN.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'ADMIN.LANDING.HERO.OPEN_ROLES',
    icon: 'shield',
    route: '/app/security',
    permissions: SECURITY_PAGE.roles,
  },
  secondaryCta: {
    labelKey: 'ADMIN.LANDING.HERO.OPEN_AUDIT',
    route: '/app/security/audit-logs',
    permissions: SECURITY_PAGE.auditLogs,
  },
  sections: [
    {
      titleKey: 'ADMIN.LANDING.SECTION.ROLES.TITLE',
      descriptionKey: 'ADMIN.LANDING.SECTION.ROLES.DESCRIPTION',
      recordKind: 'role',
      cards: [
        {
          kind: 'direct',
          icon: 'badge',
          titleKey: 'ADMIN.LANDING.CARD.ROLES_LIST.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.ROLES_LIST.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
          route: '/app/security',
          permissions: SECURITY_PAGE.roles,
        },
        {
          kind: 'direct',
          icon: 'key',
          titleKey: 'ADMIN.LANDING.CARD.PERMISSIONS_LIST.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.PERMISSIONS_LIST.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
          route: '/app/security/permissions',
          permissions: SECURITY_PAGE.permissions,
        },
        {
          kind: 'guided',
          icon: 'manage_accounts',
          titleKey: 'ADMIN.LANDING.CARD.ROLE_DETAIL.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.ROLE_DETAIL.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_ROLE',
          buildCommands: (id: string) => ['/app', 'security', 'roles', id],
          permissions: SECURITY_PAGE.roles,
        },
      ],
    },
    {
      titleKey: 'ADMIN.LANDING.SECTION.USERS.TITLE',
      descriptionKey: 'ADMIN.LANDING.SECTION.USERS.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'person_add',
          titleKey: 'ADMIN.LANDING.CARD.USER_PROVISION.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.USER_PROVISION.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
          route: '/app/security/users/provision',
          permissions: SECURITY_PAGE.userProvision,
        },
      ],
    },
    {
      titleKey: 'ADMIN.LANDING.SECTION.AUDIT.TITLE',
      descriptionKey: 'ADMIN.LANDING.SECTION.AUDIT.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'security',
          titleKey: 'ADMIN.LANDING.CARD.SECURITY_AUDIT.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.SECURITY_AUDIT.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
          route: '/app/security/audit',
          permissions: SECURITY_PAGE.shopAudit,
        },
        {
          kind: 'direct',
          icon: 'receipt_long',
          titleKey: 'ADMIN.LANDING.CARD.AUDIT_LOGS.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.AUDIT_LOGS.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
          route: '/app/security/audit-logs',
          permissions: SECURITY_PAGE.auditLogs,
        },
      ],
    },
    {
      titleKey: 'ADMIN.LANDING.SECTION.DATA_TOOLS.TITLE',
      descriptionKey: 'ADMIN.LANDING.SECTION.DATA_TOOLS.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'cloud_upload',
          titleKey: 'ADMIN.LANDING.CARD.IMPORT_JOBS.TITLE',
          descriptionKey: 'ADMIN.LANDING.CARD.IMPORT_JOBS.DESCRIPTION',
          ctaKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
          route: '/app/bulk-import/jobs',
          permissions: BULK_IMPORT_PAGE.jobs,
        },
      ],
    },
  ],
};
