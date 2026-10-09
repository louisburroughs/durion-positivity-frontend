import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../../core/services/auth.service';
import { BillDetail, BillInputTaxRecovery } from '../../../models/payables.models';
import { CLERK, authMock, bill, payablesMock } from '../../../pages/bills/bills-page.spec-helper';
import { AccountingPreferencesService } from '../../../services/accounting-preferences.service';
import { PayablesService } from '../../../services/payables.service';
import { BillReviewPanelComponent } from './bill-review-panel.component';

/** Placeholder tax-type codes only: the panel names none itself (owner direction). */
const recovered = (overrides: Partial<BillInputTaxRecovery> = {}): BillInputTaxRecovery => ({
  taxType: 'ZZ_FED_TAX',
  regime: 'ZZ_FED',
  statedAmount: 6.5,
  recoveredAmount: 6.5,
  accountCode: '1250',
  accountName: 'Tax Recoverable',
  recoveryWithheldReason: null,
  ...overrides,
});

const splitBill = (overrides: Partial<BillDetail> = {}): BillDetail =>
  bill({
    currency: 'CAD',
    status: 'APPROVED',
    netAmount: 130,
    taxAmount: 15.6,
    totalAmount: 145.6,
    taxByType: [
      { taxType: 'ZZ_FED_TAX', amount: 6.5, source: 'DOCUMENT' },
      { taxType: 'ZZ_REG_TAX', amount: 9.1, source: 'DOCUMENT' },
    ],
    inputTaxRecovery: [recovered(), recovered({ taxType: 'ZZ_REG_TAX', regime: null, statedAmount: 9.1, recoveredAmount: 0, accountCode: null, accountName: null, recoveryWithheldReason: 'NOT_RECOVERABLE' })],
    ...overrides,
  });

describe('BillReviewPanelComponent — stated tax split and claimed back (CAP:550 S33 item 8, AC 9)', () => {
  let fixture: ComponentFixture<BillReviewPanelComponent>;
  const showTerms = signal(false);
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const texts = (selector: string): string[] =>
    Array.from(host().querySelectorAll(selector)).map(element => element.textContent!.replace(/\s+/g, ' ').trim());
  /** A totals row as "term | amount". */
  const pairs = (selector: string): string[] =>
    Array.from(host().querySelectorAll(selector)).map(row => `${row.querySelector('dt')!.textContent!.trim()} | ${row.querySelector('dd')!.textContent!.trim()}`);

  function render(detail: BillDetail): void {
    const payables = payablesMock(detail);
    payables.getVendorDefaultClass.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      imports: [BillReviewPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PayablesService, useValue: payables },
        { provide: AuthService, useValue: authMock(CLERK, { tenantId: signal<string | null>('tenant-a') }).service },
        { provide: AccountingPreferencesService, useValue: { showTerms } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    fixture = TestBed.createComponent(BillReviewPanelComponent);
    fixture.componentRef.setInput('billId', detail.billId);
    fixture.detectChanges();
  }

  beforeEach(() => showTerms.set(false));

  it('lists one row per stated tax type and what was claimed back, the served amounts verbatim and nothing added (P7)', () => {
    render(splitBill());

    expect(pairs('[data-testid="panel-tax-type"]')).toEqual(['Tax on the invoice: ZZ_FED_TAX | CA$6.50', 'Tax on the invoice: ZZ_REG_TAX | CA$9.10']);
    expect(host().querySelector('[data-testid="panel-tax"]')).toBeNull();
    expect(texts('[data-testid="panel-claimed-row"]')).toEqual([
      'ZZ_FED_TAX: CA$6.50 claimed back of CA$6.50',
      'ZZ_REG_TAX: nothing claimed back of CA$9.10 — this tax can’t be claimed back',
    ]);
    expect(host().querySelector('[data-testid="panel-claimed-account"]')).toBeNull();
    // The stated split adds up to 15.60 on the server's read; the panel never sums it.
    expect(host().querySelector('[data-testid="panel-claimed-back"]')?.textContent).not.toContain('CA$15.60');
  });

  it('with accounting terms on, names where the claimed-back tax was recorded', () => {
    showTerms.set(true);
    render(splitBill());

    expect(texts('[data-testid="panel-claimed-account"]')).toEqual(['Recorded in Tax Recoverable · 1250']);
  });

  it('a bill without a split keeps the single tax row and says the invoice doesn’t split its tax (TAX_SPLIT_MISSING)', () => {
    render(
      splitBill({
        taxByType: [],
        inputTaxRecovery: [recovered({ taxType: null, regime: null, statedAmount: 15.6, recoveredAmount: 0, accountCode: null, accountName: null, recoveryWithheldReason: 'TAX_SPLIT_MISSING' })],
      }),
    );

    expect(pairs('[data-testid="panel-tax"]')).toEqual(['Tax | CA$15.60']);
    expect(texts('[data-testid="panel-claimed-row"]')).toEqual(['Tax without a type: nothing claimed back of CA$15.60 — the invoice doesn’t split its tax']);
  });

  it('an unknown withheld reason reads "Unknown" (§8.2)', () => {
    render(splitBill({ inputTaxRecovery: [recovered({ recoveredAmount: 0, recoveryWithheldReason: 'SOMETHING_NEW' })] }));

    expect(texts('[data-testid="panel-claimed-row"]')).toEqual(['ZZ_FED_TAX: nothing claimed back of CA$6.50 — Unknown']);
  });

  it('a tenant without recovery (or a bill not yet posted) shows no Claimed back at all', () => {
    render(splitBill({ inputTaxRecovery: null }));

    expect(host().querySelector('[data-testid="panel-claimed-back"]')).toBeNull();
    expect(texts('[data-testid="panel-tax-type"]').length).toBe(2);
  });

  it('a bill with no stated tax by type and no recovery reads exactly as before S33', () => {
    render(bill());

    expect(host().querySelector('[data-testid="panel-tax-type"]')).toBeNull();
    expect(host().querySelector('[data-testid="panel-claimed-back"]')).toBeNull();
    expect(pairs('[data-testid="panel-tax"]')).toEqual(['Tax | $140.50']);
  });
});
