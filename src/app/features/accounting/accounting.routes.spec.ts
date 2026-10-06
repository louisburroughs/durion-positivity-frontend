import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
});
