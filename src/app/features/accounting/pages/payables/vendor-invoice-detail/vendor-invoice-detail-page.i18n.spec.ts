/**
 * Vendor bill detail copy guard: asserts the rendered SENTENCES, not the keys
 * (ADR-0035 §8, ADR-0064 §4). The component spec runs with
 * `TranslateModule.forRoot()` and no loader, so `| translate` echoes the key;
 * this file loads the real `src/assets/i18n/*.json` bundles.
 *
 * Since S12 the `rejectionReason` field also carries the server's
 * `statusExplanation` for a held bill, so its heading must follow the status.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../../assets/i18n/qps-ploc.json';
import { PayableBillDetail, PayableBillStatus } from '../../../models/payables.models';
import { PayablesService } from '../../../services/payables.service';
import { VendorInvoiceDetailPageComponent } from './vendor-invoice-detail-page.component';

const LOCALES: readonly (readonly [string, unknown])[] = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
  ['qps-ploc', qpsPloc],
];

function lookup(bundle: unknown, key: string): string | undefined {
  let node: unknown = bundle;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

const bill = (overrides: Partial<PayableBillDetail> = {}): PayableBillDetail => ({
  billId: 'b1',
  vendorId: 'v1',
  vendorName: 'Acme',
  billNumber: 'BN-1',
  billDate: '2026-01-01',
  dueDate: '2026-02-01',
  totalAmount: 100,
  status: 'CURRENCY_HOLD',
  approvalJustification: null,
  rejectionReason: null,
  journalEntryId: null,
  paymentTransactionId: null,
  originEventId: null,
  originEventType: null,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: null,
  ...overrides,
});

async function render(locale: string, bundle: unknown, detail: PayableBillDetail): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [VendorInvoiceDetailPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: PayablesService, useValue: { getBillById: vi.fn().mockReturnValue(of(detail)) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ billId: 'b1' }) } } },
    ],
  }).compileComponents();
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation(locale, bundle as TranslationObject);
  translate.use(locale);
  const fixture = TestBed.createComponent(VendorInvoiceDetailPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function headingFor(root: HTMLElement, value: string): string | undefined {
  const row = Array.from(root.querySelectorAll('.detail-grid > div')).find(
    div => div.querySelector('dd')?.textContent?.trim() === value,
  );
  return row?.querySelector('dt')?.textContent?.trim();
}

describe('Vendor bill detail: rejection reason vs status explanation (S12)', () => {
  const held: readonly PayableBillStatus[] = ['CURRENCY_HOLD', 'MATCH_EXCEPTION'];
  const rejected: readonly PayableBillStatus[] = ['REJECTED', 'VOIDED'];

  it.each(LOCALES)('%s: a held bill labels its explanation as a status explanation, never a rejection', async (name, bundle) => {
    for (const status of held) {
      const explanation = `Held: ${status}`;
      const root = await render(name, bundle, bill({ status, rejectionReason: explanation }));

      const heading = headingFor(root, explanation);
      expect(heading).toBe(lookup(bundle, 'ACCOUNTING.PAYABLES.DETAIL.FIELD.STATUS_EXPLANATION'));
      expect(heading).not.toBe(lookup(bundle, 'ACCOUNTING.PAYABLES.DETAIL.FIELD.REJECTION_REASON'));
    }
  });

  it.each(LOCALES)('%s: a rejected or voided bill labels its reason as a rejection reason', async (name, bundle) => {
    for (const status of rejected) {
      const reason = `Reason: ${status}`;
      const root = await render(name, bundle, bill({ status, rejectionReason: reason }));

      expect(headingFor(root, reason)).toBe(lookup(bundle, 'ACCOUNTING.PAYABLES.DETAIL.FIELD.REJECTION_REASON'));
    }
  });

  it('en-US copy reads as intended', () => {
    expect(lookup(enUS, 'ACCOUNTING.PAYABLES.DETAIL.FIELD.STATUS_EXPLANATION')).toBe('Status Explanation');
    expect(lookup(enUS, 'ACCOUNTING.PAYABLES.DETAIL.FIELD.REJECTION_REASON')).toBe('Rejection Reason');
  });
});
