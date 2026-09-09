import { describe, expect, it } from 'vitest';
import { Route, Routes } from '@angular/router';

import { ACCOUNTING_ROUTES } from '../../features/accounting/accounting.routes';
import { CRM_ROUTES } from '../../features/crm/crm.routes';
import { INVENTORY_ROUTES } from '../../features/inventory/inventory.routes';
import { ACCOUNTING_LANDING_CONFIG } from '../../features/accounting/pages/landing/accounting-landing.config';
import { CRM_LANDING_CONFIG } from '../../features/crm/pages/landing/crm-landing.config';
import { INVENTORY_LANDING_CONFIG } from '../../features/inventory/pages/landing/inventory-landing.config';
import { LandingCard, LandingCta, LandingPageConfig } from '../../shared/landing/landing.models';
import { PERMISSION_BY_BIT } from './permission-catalog';
import {
  ACCOUNTING_PERMISSIONS,
  CRM_PERMISSIONS,
  INVENTORY_PERMISSIONS,
} from './route-permissions';

/**
 * Guards the fix for #236. #235 gated the 14 domain groups under `/app` on the
 * union of their domain's permissions; a user holding *some* of a domain's
 * permissions could still open a page inside it needing one they lack, and land
 * on a page that can only 403.
 *
 * These specs hold the per-page gates honest for the three groups that produced
 * the most 403s in the #230 crawl:
 *   - every routed page declares a gate,
 *   - on codes the backend catalog defines,
 *   - that its own group gate will admit (a page gate the group refuses is a
 *     dead end, not a narrowing), and
 *   - that the landing page offering the page agrees with, so a card is never
 *     shown for a page the guard would bounce.
 */

interface GroupUnderTest {
  readonly name: string;
  readonly routes: Routes;
  readonly groupPermissions: readonly string[];
  readonly landing: LandingPageConfig;
  readonly base: string;
}

const GROUPS: readonly GroupUnderTest[] = [
  {
    name: '/app/inventory',
    routes: INVENTORY_ROUTES,
    groupPermissions: INVENTORY_PERMISSIONS,
    landing: INVENTORY_LANDING_CONFIG,
    base: '/app/inventory',
  },
  {
    name: '/app/accounting',
    routes: ACCOUNTING_ROUTES,
    groupPermissions: ACCOUNTING_PERMISSIONS,
    landing: ACCOUNTING_LANDING_CONFIG,
    base: '/app/accounting',
  },
  {
    name: '/app/crm',
    routes: CRM_ROUTES,
    groupPermissions: CRM_PERMISSIONS,
    landing: CRM_LANDING_CONFIG,
    base: '/app/crm',
  },
];

/**
 * The landing page itself renders from static config and calls no API, so it
 * cannot 403 — gating it would strand a user the group already admitted. `**`
 * only redirects back to it.
 */
const UNGATED_BY_DESIGN = new Set(['', '**']);

/** The routed pages of a group: the children of its single empty-path shell route. */
function pagesOf(routes: Routes): readonly Route[] {
  const shell = routes.find(route => route.path === '');
  return (shell?.children ?? []).filter(child => !UNGATED_BY_DESIGN.has(child.path ?? ''));
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

describe.each(GROUPS)('$name per-page access', group => {
  const pages = pagesOf(group.routes);

  it('finds the pages it is meant to check', () => {
    // Cheap canary: a restructured route file must not silently empty this list.
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it('gates every page on permissions or roles', () => {
    const ungated = pages
      .filter(page => !declaredCodes(page).length && !declaredRoles(page).length)
      .map(page => `${group.base}/${page.path}`);

    expect(ungated).toEqual([]);
  });

  it('gates pages on permission codes the backend catalog defines', () => {
    const catalog = new Set(PERMISSION_BY_BIT);
    const unknown = pages.flatMap(page =>
      declaredCodes(page)
        .filter(code => !catalog.has(code))
        .map(code => `${group.base}/${page.path}: ${code}`),
    );

    expect(unknown).toEqual([]);
  });

  it('declares a non-empty permission set wherever it gates on permissions', () => {
    // An empty array reads as "no constraint" to the guard — a gate that isn't.
    const empty = pages
      .filter(page => page.data?.['permissions'] !== undefined || page.data?.['allPermissions'] !== undefined)
      .filter(page => !declaredCodes(page).length)
      .map(page => `${group.base}/${page.path}`);

    expect(empty).toEqual([]);
  });

  it('gates no page on a permission its own group gate would refuse', () => {
    // Both gates run, so a page code outside the group's set is unreachable for
    // anyone holding only that code — a narrower dead end, not a narrower gate.
    const groupSet = new Set(group.groupPermissions);
    const stranded = pages.flatMap(page =>
      declaredCodes(page)
        .filter(code => !groupSet.has(code))
        .map(code => `${group.base}/${page.path}: ${code} is not in the group's permission set`),
    );

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

describe.each(GROUPS)('$name landing page offers', group => {
  const pages = pagesOf(group.routes);

  function routeFor(targetPath: string): Route | undefined {
    const relative = targetPath.startsWith(`${group.base}/`)
      ? targetPath.slice(group.base.length + 1)
      : undefined;
    if (relative === undefined) return undefined;
    return pages.find(page => matchesRoute(page.path ?? '', relative));
  }

  const offers: readonly { readonly label: string; readonly path: string; readonly access: LandingCard | LandingCta }[] = [
    ...(group.landing.primaryCta
      ? [{ label: 'primary CTA', path: ctaPath(group.landing.primaryCta), access: group.landing.primaryCta }]
      : []),
    ...(group.landing.secondaryCta
      ? [{ label: 'secondary CTA', path: ctaPath(group.landing.secondaryCta), access: group.landing.secondaryCta }]
      : []),
    ...group.landing.sections.flatMap(section =>
      section.cards.map(card => ({ label: card.titleKey, path: cardPath(card), access: card })),
    ),
  ];

  it('finds the cards it is meant to check', () => {
    expect(offers.length).toBeGreaterThanOrEqual(10);
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
