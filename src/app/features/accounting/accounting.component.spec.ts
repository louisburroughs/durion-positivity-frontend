import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it } from 'vitest';
import { JwtClaims } from '../../core/models/auth.models';
import { AuthService } from '../../core/services/auth.service';
import { AccountingComponent } from './accounting.component';

@Component({ selector: 'app-stub-page', standalone: true, template: '<p>page</p>' })
class StubPageComponent {}

const CLAIMS: JwtClaims = { sub: 'clerk', tid: 'tenant-a', exp: 4102444800 };

function authHolding(held: readonly string[] | null): Partial<AuthService> {
  return {
    currentUserClaims: signal<JwtClaims | null>(CLAIMS),
    tenantId: signal<string | null>(CLAIMS.tid ?? null),
    permissionsKnown: signal(held !== null),
    hasAnyRole: () => false,
    hasPermission: (code: string) => !!held?.includes(code),
    hasAnyPermission: (codes: readonly string[]) => !!held && codes.some(code => held.includes(code)),
  } as unknown as Partial<AuthService>;
}

async function render(held: readonly string[] | null, url = '/app/accounting'): Promise<RouterTestingHarness> {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      { provide: AuthService, useValue: authHolding(held) },
      provideRouter([
        {
          path: 'app/accounting',
          component: AccountingComponent,
          children: [
            { path: '', pathMatch: 'full', component: StubPageComponent },
            { path: 'bank-accounts', component: StubPageComponent },
            { path: 'periods', component: StubPageComponent },
            { path: 'payables/vendor-invoices', component: StubPageComponent },
          ],
        },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.fixture.detectChanges();
  return harness;
}

const links = (harness: RouterTestingHarness): HTMLAnchorElement[] =>
  Array.from(harness.routeNativeElement?.ownerDocument.querySelectorAll<HTMLAnchorElement>('.accounting-subnav__link') ?? []);

describe('AccountingComponent (shell, §5.0)', () => {
  afterEach(() => localStorage.clear());

  it('shows Home and Bank only to a session holding only accounting:reconciliation:view', async () => {
    const harness = await render(['accounting:reconciliation:view']);

    expect(links(harness).map(link => link.dataset['route'])).toEqual(['', 'bank-accounts']);
  });

  it('marks the current entry with aria-current="page" and no other', async () => {
    const harness = await render(['accounting:reconciliation:view'], '/app/accounting/bank-accounts');

    const [home, bank] = links(harness);
    expect(bank.getAttribute('aria-current')).toBe('page');
    expect(home.getAttribute('aria-current')).toBeNull();
  });

  it('marks Home current on the home only (exact match)', async () => {
    const harness = await render(['accounting:reconciliation:view']);

    expect(links(harness)[0].getAttribute('aria-current')).toBe('page');
  });

  it('shows every entry for a token without perm_bits (canAccess fallback)', async () => {
    const harness = await render(null);

    expect(links(harness).map(link => link.dataset['route'])).toEqual([
      '',
      'payables/vendor-invoices',
      'bank-accounts',
      'books',
      'periods',
    ]);
  });

  it('labels the navigation and offers Show accounting terms as a real labelled checkbox', async () => {
    const harness = await render(['accounting:period:view']);
    const doc = harness.routeNativeElement!.ownerDocument;

    expect(doc.querySelector('nav.accounting-subnav')?.getAttribute('aria-label')).toBe('ACCOUNTING.SHELL.NAV.ARIA');
    const box = doc.querySelector<HTMLInputElement>('[data-testid="show-terms"]')!;
    expect(box.type).toBe('checkbox');
    expect(box.closest('label')?.textContent).toContain('ACCOUNTING.SHELL.SHOW_TERMS');
  });

  it('persists the switch and adds the accountant’s term to labels when ticked', async () => {
    const harness = await render(['accounting:period:view']);
    const doc = harness.routeNativeElement!.ownerDocument;
    const box = doc.querySelector<HTMLInputElement>('[data-testid="show-terms"]')!;

    box.click();
    harness.fixture.detectChanges();

    expect(localStorage.getItem('durion.accounting.prefs:tenant-a:clerk')).toContain('"showTerms":true');
    expect(doc.querySelector('.accounting-subnav__term')?.textContent).toContain('ACCOUNTING.SHELL.NAV.MONTH_END_TERM');
  });
});
