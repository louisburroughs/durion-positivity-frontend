import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { ApPolicyRead } from '../../models/ap-approval-policy.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { PayablesService } from '../../services/payables.service';
import { ApprovalLimitsPageComponent } from '../approval-limits/approval-limits-page.component';
import { BillPanelRouteComponent } from './bill-panel-route/bill-panel-route.component';
import { BillsPageComponent } from './bills-page.component';
import { CONTROLLER, action, authMock, awaitingBill, check, payablesMock } from './bills-page.spec-helper';

/**
 * Genuine axe coverage of the RENDERED Bills to pay and Approval limits pages
 * (§9.6, AC 13), in both themes. `scripts/a11y/smoke-routes.mjs` scans both
 * routes too, but only sees the un-hydrated shell; this renders the real DOM
 * with the real en-US copy: the list, a bill's review panel with checks, match
 * score, routing note and decisions, the reject dialog, and the limits page.
 */
async function seriousViolations(root: HTMLElement): Promise<{ id: string; targets: string[] }[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(' ')) }));
}

const THEMES = ['light', 'dark'] as const;

const reviewBill = awaitingBill({
  match: { score: 82, confidence: 'HIGH_CONFIDENCE', points: { amount: 40, products: 30, date: 10, purchaseOrder: 2 }, invoiceReference: 'INV-4471', invoiceDate: '2026-10-01', withinTolerance: true },
  checks: [
    check('MATCHED_TO_DELIVERY', 'PASS'),
    check('WITHIN_CLERK_LIMIT', 'FAIL', { clerkLimit: '1000.00', currencyCode: 'USD' }),
    check('TAX_ON_RESALE_GOODS', 'FAIL', { taxAmount: '12.40', currencyCode: 'USD' }),
  ],
  lines: [
    { lineNumber: 1, description: 'Brake pads', inventoryItem: true, receivedQuantity: 4, receivedUnitPrice: 20, billedQuantity: 4, billedUnitPrice: 21, currencyCode: 'USD' },
  ],
  availableActions: [action('APPROVE'), action('REJECT'), action('SET_DUE_DATE')],
});

describe('Bills to pay a11y (rendered DOM)', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.querySelectorAll('[data-a11y-host]').forEach(node => node.remove());
  });

  function configure(detail = reviewBill): void {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([
          {
            path: 'app/accounting/bills',
            component: BillsPageComponent,
            children: [
              { path: '', pathMatch: 'full', component: BillPanelRouteComponent },
              { path: ':billId', component: BillPanelRouteComponent },
            ],
          },
        ]),
        { provide: PayablesService, useValue: payablesMock(detail) },
        { provide: AuthService, useValue: authMock(CONTROLLER, { tenantId: signal<string | null>(null) }).service },
        { provide: AccountingPreferencesService, useValue: { showTerms: signal(true) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
  }

  async function renderBills(url = '/app/accounting/bills/bill-1', detail = reviewBill): Promise<RouterTestingHarness> {
    configure(detail);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    const host = harness.fixture.nativeElement as HTMLElement;
    host.setAttribute('data-a11y-host', '');
    document.body.appendChild(host);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }

  for (const theme of THEMES) {
    it(`reports no serious violation with a bill's review panel open (${theme} theme), and keeps one h1`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const harness = await renderBills();
      const host = harness.fixture.nativeElement as HTMLElement;

      expect(host.querySelectorAll('h1').length).toBe(1);
      expect(host.querySelector('[data-testid="bill-panel"]')).not.toBeNull();
      expect(host.querySelector('meter')).not.toBeNull();
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`reports no serious violation in the reject dialog (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const harness = await renderBills();
      const host = harness.fixture.nativeElement as HTMLElement;
      (host.querySelector('[data-testid="reject"]') as HTMLButtonElement).click();
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(host.querySelector('dialog')?.matches(':modal')).toBe(true);
      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  for (const theme of THEMES) {
    it(`reports no serious violation with the posting choices shown (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const edi = awaitingBill({
        lines: [],
        checks: [check('TOTALS_ADD_UP', 'FAIL', { netAmount: '100.00', taxAmount: '13.00', totalAmount: '115.00', difference: '2.00' })],
        availableActions: [action('APPROVE'), action('REJECT')],
      });
      const harness = await renderBills('/app/accounting/bills/bill-1', edi);
      const host = harness.fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="classification"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="difference"]')).not.toBeNull();
      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  it('makes bill rows, steps and primary actions at least 44px tall (§5.7)', async () => {
    const harness = await renderBills();
    const host = harness.fixture.nativeElement as HTMLElement;

    const targets = [
      ...Array.from(host.querySelectorAll<HTMLElement>('[data-testid="bill-item"]')),
      ...Array.from(host.querySelectorAll<HTMLElement>('[data-testid="stage-step"]')),
      host.querySelector<HTMLElement>('[data-testid="approve"]')!,
      host.querySelector<HTMLElement>('[data-testid="reject"]')!,
    ];
    for (const element of targets) expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it('labels the selection by aria-pressed and gives every step a name of its own', async () => {
    const harness = await renderBills();
    const host = harness.fixture.nativeElement as HTMLElement;

    const steps = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="stage-step"]'));
    expect(steps.map(step => step.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(new Set(steps.map(step => step.textContent?.trim())).size).toBe(4);
    expect(host.querySelector('[data-testid="bill-item"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Approval limits a11y (rendered DOM)', () => {
  let fixture: ComponentFixture<ApprovalLimitsPageComponent>;

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
  });

  const served: ApPolicyRead = {
    policy: { clerkApprovalLimit: 2500, autoApprovalLimit: 500, currencyCode: 'USD', allowCreatorApproval: true, allowApproverPayment: false, defaultTerms: 'NET30', asOf: '2026-10-06T10:00:00Z' },
    history: {
      rows: [
        { changedAt: '2026-10-05T15:00:00Z', changedBy: 'controller.cfo', changedByRoles: ['CONTROLLER'], setting: 'AP_CLERK_APPROVAL_LIMIT', oldValue: '1000.00', newValue: '2500.00', justification: 'Clerks handle routine parts orders' },
      ],
      page: 0,
      size: 20,
      total: 1,
    },
  };

  for (const theme of THEMES) {
    it(`reports no serious violation with an inline error and the disclosure open (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      TestBed.configureTestingModule({
        imports: [ApprovalLimitsPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: ApApprovalPolicyService, useValue: { getPolicy: vi.fn(() => of(served)), updatePolicy: vi.fn(() => of(served)) } },
          { provide: AuthService, useValue: authMock(CONTROLLER, { tenantId: signal<string | null>(null) }).service },
        ],
      });
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
      fixture = TestBed.createComponent(ApprovalLimitsPageComponent);
      document.body.appendChild(fixture.nativeElement as HTMLElement);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const auto = host.querySelector<HTMLInputElement>('[data-testid="auto-limit"]')!;
      auto.value = '9000';
      auto.dispatchEvent(new Event('input'));
      (host.querySelector('[data-testid="who-can-do-what"]') as HTMLDetailsElement).open = true;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(host.querySelector('[data-testid="auto-above-clerk"]')).not.toBeNull();
      expect(host.querySelectorAll('h1').length).toBe(1);
      expect(await seriousViolations(host)).toEqual([]);
    });
  }
});
