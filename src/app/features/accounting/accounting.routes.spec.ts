import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNTING_PERMISSIONS } from '../../core/security/route-permissions';
import { ACCOUNTING_ROUTES } from './accounting.routes';

/**
 * `/events/failed` is a redirect with a query string. Angular's static
 * `redirectTo` treats the whole string as path segments, which produced the
 * `/events/events` navigation reported in #201.
 */
describe('ACCOUNTING_ROUTES', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/accounting', children: ACCOUNTING_ROUTES }])],
    });
    router = TestBed.inject(Router);
  });

  it('redirects events/failed to the event list with processingStatus as a query parameter', async () => {
    await router.navigateByUrl('/app/accounting/events/failed');

    const tree = router.parseUrl(router.url);
    expect(router.url.split('?')[0]).toBe('/app/accounting/events');
    expect(tree.queryParams).toEqual({ processingStatus: 'FAILED' });
  });

  it('never resolves the failed-events redirect to a duplicated events segment', async () => {
    await router.navigateByUrl('/app/accounting/events/failed');

    expect(router.url).not.toContain('/events/events');
    expect(router.url).not.toContain('events%3F');
  });

  it('redirects the retired payments/apply page to Customer payments (CAP:550 S6, §8.1)', async () => {
    await router.navigateByUrl('/app/accounting/payments/apply');

    expect(router.url).toBe('/app/accounting/payments');
  });

  it('no longer routes any page component at payments/apply (the old page is deleted)', () => {
    const children = ACCOUNTING_ROUTES[0].children ?? [];
    const old = children.find(child => child.path === 'payments/apply');
    expect(old?.redirectTo).toBe('payments');
    expect(old?.loadComponent).toBeUndefined();
    expect(children.find(child => child.path === 'payments')?.data?.['permissions']).toEqual([
      'accounting:payment:apply',
    ]);
  });

  it.each([
    ['/app/accounting/payables/vendor-invoices', '/app/accounting/bills'],
    ['/app/accounting/payables/vendor-invoices/exceptions', '/app/accounting/bills'],
    ['/app/accounting/payables/vendor-invoices/bill-42', '/app/accounting/bills/bill-42'],
  ])('redirects the retired %s to %s (CAP:550 S14, AC 5)', async (from, to) => {
    await router.navigateByUrl(from);

    expect(router.url).toBe(to);
  });

  it('routes bills and bills/:billId to one page whose child route is the review panel (§8.1)', () => {
    const children = ACCOUNTING_ROUTES[0].children ?? [];
    const bills = children.find(child => child.path === 'bills');
    expect(bills?.data?.['permissions']).toEqual(['accounting:ap:view']);
    expect(bills?.children?.map(child => child.path)).toEqual(['', ':billId']);
    for (const child of bills?.children ?? []) expect(child.data?.['permissions']).toEqual(['accounting:ap:view']);
    // The old pages are gone: only redirects remain at their paths.
    for (const old of ['payables/vendor-invoices', 'payables/vendor-invoices/exceptions', 'payables/vendor-invoices/:billId']) {
      const route = children.find(child => child.path === old);
      expect(route?.redirectTo).toBeDefined();
      expect(route?.loadComponent).toBeUndefined();
    }
  });

  it('gates Approval limits on §8.1\'s any-of: bill limits, the drawer policy or category edits (S21)', () => {
    const children = ACCOUNTING_ROUTES[0].children ?? [];
    expect(children.find(child => child.path === 'settings/approval-limits')?.data?.['permissions']).toEqual([
      'accounting:ap_approval_policy:manage',
      'order:session_policy:manage',
      'accounting:mapping-key:edit',
    ]);
  });

  it('admits a drawer-only manager at /app/accounting, so the page gate is not a dead end (S21, AC 1)', () => {
    expect(ACCOUNTING_PERMISSIONS).toContain('order:session_policy:manage');
    // Only that exact code: the rest of the order domain has no page here.
    expect(ACCOUNTING_PERMISSIONS.filter(code => code.startsWith('order:'))).toEqual(['order:session_policy:manage']);
  });
});
