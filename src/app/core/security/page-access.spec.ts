import { describe, expect, it } from 'vitest';
import { Route, Routes } from '@angular/router';

import { ACCOUNTING_ROUTES } from '../../features/accounting/accounting.routes';
import { ADMIN_ROUTES } from '../../features/admin/admin.routes';
import { BILLING_ROUTES } from '../../features/billing/billing.routes';
import { BULK_IMPORT_ROUTES } from '../../features/bulk-import/bulk-import.routes';
import { CRM_ROUTES } from '../../features/crm/crm.routes';
import { INVENTORY_ROUTES } from '../../features/inventory/inventory.routes';
import { LOCATION_ROUTES } from '../../features/location/location.routes';
import { ORDER_ROUTES } from '../../features/order/order.routes';
import { PEOPLE_ROUTES } from '../../features/people/people.routes';
import { POSITIVITY_ROUTES } from '../../features/positivity/positivity.routes';
import { PRODUCT_ROUTES } from '../../features/product/product.routes';
import { SECURITY_ROUTES } from '../../features/security/security.routes';
import { SHOPMGMT_ROUTES } from '../../features/shopmgmt/shopmgmt.routes';
import { WORKEXEC_ROUTES } from '../../features/workexec/workexec.routes';

import { ACCOUNTING_LANDING_CONFIG } from '../../features/accounting/pages/landing/accounting-landing.config';
import { ADMIN_LANDING_CONFIG } from '../../features/admin/pages/landing/admin-landing.config';
import { BILLING_LANDING_CONFIG } from '../../features/billing/pages/landing/billing-landing.config';
import { CRM_LANDING_CONFIG } from '../../features/crm/pages/landing/crm-landing.config';
import { INVENTORY_LANDING_CONFIG } from '../../features/inventory/pages/landing/inventory-landing.config';
import { LOCATION_LANDING_CONFIG } from '../../features/location/pages/landing/location-landing.config';
import { PEOPLE_LANDING_CONFIG } from '../../features/people/pages/landing/people-landing.config';
import { PRODUCT_LANDING_CONFIG } from '../../features/product/pages/landing/product-landing.config';
import { SHOPMGMT_LANDING_CONFIG } from '../../features/shopmgmt/pages/landing/shopmgmt-landing.config';
import { WORKEXEC_LANDING_CONFIG } from '../../features/workexec/pages/landing/workexec-landing.config';

import { LandingCard, LandingCta, LandingPageConfig } from '../../shared/landing/landing.models';
import { PERMISSION_BY_BIT } from './permission-catalog';
import {
  ACCOUNTING_PERMISSIONS,
  BILLING_PERMISSIONS,
  BULK_IMPORT_PERMISSIONS,
  CRM_PERMISSIONS,
  INVENTORY_PERMISSIONS,
  LOCATION_PERMISSIONS,
  ORDER_PERMISSIONS,
  PEOPLE_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  SHOPMGMT_PERMISSIONS,
  WORKEXEC_PERMISSIONS,
} from './route-permissions';

/**
 * Guards the fix for #236. #235 gated the 14 domain groups under `/app` on the
 * union of their domain's permissions. That closed the group-level gap but left
 * a narrower one: a user holding *some* of a domain's permissions could still
 * open a page inside it needing one they lack, and land on a page that can only
 * 403.
 *
 * Every page's requirement was traced page → service → endpoint → the
 * controller's `@PreAuthorize`, which the backend publishes per operation as
 * `x-required-permissions`. These specs hold that mapping honest:
 *   - every routed page declares a gate, or appears in UNGATED_BY_DESIGN with a
 *     reason,
 *   - on codes the backend catalog defines,
 *   - that its own group gate will admit (a page gate the group refuses is a
 *     dead end, not a narrowing), and
 *   - that any landing card offering the page agrees with, so a card is never
 *     shown for a page the guard would bounce.
 */

interface GroupUnderTest {
  readonly name: string;
  readonly base: string;
  readonly routes: Routes;
  /** Absent for groups gated on `roles` rather than permissions. */
  readonly groupPermissions?: readonly string[];
}

const GROUPS: readonly GroupUnderTest[] = [
  { name: '/app/inventory', base: '/app/inventory', routes: INVENTORY_ROUTES, groupPermissions: INVENTORY_PERMISSIONS },
  { name: '/app/accounting', base: '/app/accounting', routes: ACCOUNTING_ROUTES, groupPermissions: ACCOUNTING_PERMISSIONS },
  { name: '/app/crm', base: '/app/crm', routes: CRM_ROUTES, groupPermissions: CRM_PERMISSIONS },
  { name: '/app/workexec', base: '/app/workexec', routes: WORKEXEC_ROUTES, groupPermissions: WORKEXEC_PERMISSIONS },
  { name: '/app/shopmgmt', base: '/app/shopmgmt', routes: SHOPMGMT_ROUTES, groupPermissions: SHOPMGMT_PERMISSIONS },
  { name: '/app/product', base: '/app/product', routes: PRODUCT_ROUTES, groupPermissions: PRODUCT_PERMISSIONS },
  { name: '/app/people', base: '/app/people', routes: PEOPLE_ROUTES, groupPermissions: PEOPLE_PERMISSIONS },
  { name: '/app/location', base: '/app/location', routes: LOCATION_ROUTES, groupPermissions: LOCATION_PERMISSIONS },
  { name: '/app/billing', base: '/app/billing', routes: BILLING_ROUTES, groupPermissions: BILLING_PERMISSIONS },
  { name: '/app/order', base: '/app/order', routes: ORDER_ROUTES, groupPermissions: ORDER_PERMISSIONS },
  { name: '/app/bulk-import', base: '/app/bulk-import', routes: BULK_IMPORT_ROUTES, groupPermissions: BULK_IMPORT_PERMISSIONS },
  // Role-gated groups: the mount point carries `roles: ['ROLE_ADMIN']`, so there
  // is no group permission set for a page gate to sit inside.
  { name: '/app/security', base: '/app/security', routes: SECURITY_ROUTES },
  { name: '/app/positivity', base: '/app/positivity', routes: POSITIVITY_ROUTES },
  { name: '/app/admin', base: '/app/admin', routes: ADMIN_ROUTES },
];

/**
 * Pages that ship without a permission gate, and why. Every entry is a case
 * where gating would be wrong, not one that is merely unfinished — a gate here
 * would refuse sessions the backend accepts.
 */
const UNGATED_BY_DESIGN: Readonly<Record<string, string>> = {
  // Domain landings render from static config; their cards are filtered
  // individually, so gating the landing would strand a user the group admitted.
  '/app/inventory': 'landing page — static config, cards filtered individually',
  '/app/accounting': 'landing page — static config, cards filtered individually',
  '/app/crm': 'landing page — static config, cards filtered individually',
  '/app/workexec': 'landing page — static config, cards filtered individually',
  '/app/shopmgmt': 'landing page — static config, cards filtered individually',
  '/app/product': 'landing page — static config, cards filtered individually',
  '/app/people': 'landing page — static config, cards filtered individually',
  '/app/location': 'landing page — static config, cards filtered individually',
  '/app/billing': 'landing page — static config, cards filtered individually',
  '/app/admin': 'landing page — static config, cards filtered individually',
  '/app/bulk-import': 'redirect to the job list',

  // Primary read carries the backend's AUTHENTICATED sentinel: `isAuthenticated()`
  // or no `@PreAuthorize` at all, so the page cannot 403 on load.
  '/app/workexec/workorders/:workorderId': 'getWorkorderDetail is AUTHENTICATED-only',
  '/app/workexec/workorders/:id/operational-context': 'getOperationalContext is AUTHENTICATED-only',
  '/app/people/timekeeping/work-session': 'work-session start/stop are AUTHENTICATED-only',
  '/app/people/timekeeping/work-session/:sessionId/submit': 'submitWorkSession is AUTHENTICATED-only',
  '/app/billing/invoices/:invoiceId/payment-capture': 'payment initiate/capture are AUTHENTICATED-only',
  '/app/billing/invoices/:invoiceId/payments/:paymentId/void-refund': 'void/refund are AUTHENTICATED-only',
  '/app/billing/invoices/:invoiceId/receipts': 'receipt generate/reprint are AUTHENTICATED-only',
  '/app/billing/invoices/:invoiceId/receipts/:receiptId': 'receipt generate/reprint are AUTHENTICATED-only',

  // Calls endpoints no module's openapi.yaml publishes, so there is no
  // `@PreAuthorize` to trace and no code that could be right.
  '/app/workexec/workorders/:workorderId/invoice-finalization':
    'getWorkorderInvoiceView has no published contract',
  '/app/product/inventory/feeds': 'availability-by-sku and lead-time have no published contract',

  // The backend defines people:employee_pii:view, but catalog v81 predates it,
  // so no token can decode to it — gating here would refuse everyone. Gate it
  // once the catalog is regenerated (see #236's catalog-drift note).
  '/app/people/employees/:id': 'people:employee_pii:view is absent from catalog v81',
};

/**
 * Routed pages of a group. Most groups nest theirs under a single empty-path
 * shell route; `/app/positivity` and `/app/admin` declare theirs flat.
 */
function pagesOf(routes: Routes): readonly Route[] {
  const shell = routes.find(route => route.path === '' && route.children?.length);
  const pages = shell ? (shell.children ?? []) : routes;
  return pages.filter(page => page.path !== '**');
}

function fullPath(base: string, page: Route): string {
  return page.path ? `${base}/${page.path}` : base;
}

const anyPermissions = (route: Route): readonly string[] =>
  (route.data?.['permissions'] as readonly string[] | undefined) ?? [];
const allPermissions = (route: Route): readonly string[] =>
  (route.data?.['allPermissions'] as readonly string[] | undefined) ?? [];
const declaredRoles = (route: Route): readonly string[] =>
  (route.data?.['roles'] as readonly string[] | undefined) ?? [];
const declaredCodes = (route: Route): readonly string[] => [
  ...anyPermissions(route),
  ...allPermissions(route),
];

describe('/app page access', () => {
  const allPages = GROUPS.flatMap(group =>
    pagesOf(group.routes).map(page => ({ group, page, path: fullPath(group.base, page) })),
  );

  it('finds the pages it is meant to check', () => {
    // Cheap canary: a restructured route file must not silently empty this list.
    expect(allPages.length).toBeGreaterThanOrEqual(140);
    expect(GROUPS.every(group => pagesOf(group.routes).length > 0)).toBe(true);
  });

  it('gates every page on permissions or roles, or records why not', () => {
    const ungated = allPages
      .filter(({ page }) => !declaredCodes(page).length && !declaredRoles(page).length)
      .map(({ path }) => path)
      .filter(path => !(path in UNGATED_BY_DESIGN));

    expect(ungated).toEqual([]);
  });

  it('keeps the ungated-by-design list free of pages that are in fact gated', () => {
    // A stale exemption hides a page from the checks above; drop it once the
    // page carries a real gate.
    const byPath = new Map(allPages.map(({ path, page }) => [path, page]));
    const stale = Object.keys(UNGATED_BY_DESIGN).filter(path => {
      const page = byPath.get(path);
      return !page || declaredCodes(page).length > 0;
    });

    expect(stale).toEqual([]);
  });

  it('gates pages on permission codes the backend catalog defines', () => {
    const catalog = new Set(PERMISSION_BY_BIT);
    const unknown = allPages.flatMap(({ page, path }) =>
      declaredCodes(page)
        .filter(code => !catalog.has(code))
        .map(code => `${path}: ${code}`),
    );

    expect(unknown).toEqual([]);
  });

  it('declares a non-empty permission set wherever it gates on permissions', () => {
    // An empty array reads as "no constraint" to the guard — a gate that isn't.
    const empty = allPages
      .filter(({ page }) => page.data?.['permissions'] !== undefined || page.data?.['allPermissions'] !== undefined)
      .filter(({ page }) => !declaredCodes(page).length)
      .map(({ path }) => path);

    expect(empty).toEqual([]);
  });

  it('gates no page on a permission its own group gate would refuse', () => {
    // Both gates run, so a page code outside the group's set is unreachable for
    // anyone holding only that code — a narrower dead end, not a narrower gate.
    const stranded = allPages.flatMap(({ group, page, path }) => {
      if (!group.groupPermissions) return [];
      const groupSet = new Set(group.groupPermissions);
      return declaredCodes(page)
        .filter(code => !groupSet.has(code))
        .map(code => `${path}: ${code} is not in ${group.name}'s permission set`);
    });

    expect(stranded).toEqual([]);
  });
});

/** A card's target path, with a placeholder standing in for any record id. */
function cardPath(card: LandingCard): string {
  if (card.kind === 'direct') {
    return typeof card.route === 'string' ? card.route : card.route.join('/');
  }
  return card.buildCommands(':id', ':secondary').join('/').replace('//', '/');
}

function ctaPath(cta: LandingCta): string {
  return typeof cta.route === 'string' ? cta.route : cta.route.join('/');
}

/** Route paths carry `:params`; card paths carry ids. Compare segment by segment. */
function matchesRoute(routePath: string, targetPath: string): boolean {
  const routeSegments = routePath.split('/').filter(Boolean);
  const targetSegments = targetPath.split('/').filter(Boolean);
  if (routeSegments.length !== targetSegments.length) return false;
  return routeSegments.every(
    (segment, index) => segment.startsWith(':') || segment === targetSegments[index],
  );
}

const LANDINGS: readonly { readonly name: string; readonly config: LandingPageConfig }[] = [
  { name: 'inventory', config: INVENTORY_LANDING_CONFIG },
  { name: 'accounting', config: ACCOUNTING_LANDING_CONFIG },
  { name: 'crm', config: CRM_LANDING_CONFIG },
  { name: 'workexec', config: WORKEXEC_LANDING_CONFIG },
  { name: 'shopmgmt', config: SHOPMGMT_LANDING_CONFIG },
  { name: 'product', config: PRODUCT_LANDING_CONFIG },
  { name: 'people', config: PEOPLE_LANDING_CONFIG },
  { name: 'location', config: LOCATION_LANDING_CONFIG },
  { name: 'billing', config: BILLING_LANDING_CONFIG },
  { name: 'admin', config: ADMIN_LANDING_CONFIG },
];

describe.each(LANDINGS)('$name landing page offers', ({ config }) => {
  /** Cards may point into another group (the admin landing opens /app/security). */
  const routeIndex: readonly { readonly path: string; readonly route: Route }[] = GROUPS.flatMap(
    group => pagesOf(group.routes).map(page => ({ path: fullPath(group.base, page), route: page })),
  );

  function routeFor(targetPath: string): Route | undefined {
    return routeIndex.find(entry => matchesRoute(entry.path, targetPath))?.route;
  }

  const offers: readonly { readonly label: string; readonly path: string; readonly access: LandingCard | LandingCta }[] = [
    ...(config.primaryCta
      ? [{ label: 'primary CTA', path: ctaPath(config.primaryCta), access: config.primaryCta }]
      : []),
    ...(config.secondaryCta
      ? [{ label: 'secondary CTA', path: ctaPath(config.secondaryCta), access: config.secondaryCta }]
      : []),
    ...config.sections.flatMap(section =>
      section.cards.map(card => ({ label: card.titleKey, path: cardPath(card), access: card })),
    ),
  ];

  it('finds the cards it is meant to check', () => {
    expect(offers.length).toBeGreaterThanOrEqual(5);
  });

  it('points every card at a route that exists', () => {
    const dangling = offers.filter(offer => !routeFor(offer.path)).map(offer => `${offer.label} → ${offer.path}`);

    expect(dangling).toEqual([]);
  });

  it('carries the same access requirement as the route each card opens', () => {
    const disagreements = offers.flatMap(offer => {
      const route = routeFor(offer.path);
      if (!route) return [];

      const routeAny = [...anyPermissions(route)].sort();
      const routeAll = [...allPermissions(route)].sort();
      const cardAny = [...(offer.access.permissions ?? [])].sort();
      const cardAll = [...(offer.access.allPermissions ?? [])].sort();

      if (routeAny.join('|') !== cardAny.join('|') || routeAll.join('|') !== cardAll.join('|')) {
        return [
          `${offer.label} → ${offer.path}: card [${cardAny.join(',')}]/[${cardAll.join(',')}] ` +
            `vs route [${routeAny.join(',')}]/[${routeAll.join(',')}]`,
        ];
      }
      return [];
    });

    expect(disagreements).toEqual([]);
  });
});
