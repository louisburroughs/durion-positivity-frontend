import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { check } from '../../../pages/bills/bills-page.spec-helper';
import { BillDecisionFailure } from '../../../utils/bill-errors';
import { BillPostingFieldsComponent } from './bill-posting-fields.component';

const failure = (code: string, field: BillDecisionFailure['view']['field']): BillDecisionFailure => ({
  kind: 'APPROVE',
  view: { code, message: { key: `ACCOUNTING.BILLS.ERROR.${code}`, params: {} }, field, reread: false, notFound: false },
});

describe('BillPostingFieldsComponent (Accounting ruling Q1 on #464)', () => {
  let fixture: ComponentFixture<BillPostingFieldsComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const set = (name: string, value: unknown): void => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BillPostingFieldsComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BillPostingFieldsComponent);
    fixture.detectChanges();
  });

  it('renders nothing when no field applies', () => {
    expect(q('[data-testid="posting-fields"]')).toBeNull();
  });

  it('offers Stock for the shelves and writes GOODS to the bound value (AC a)', () => {
    set('showClassification', true);
    q<HTMLInputElement>('[data-testid="classification-goods"]')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.classification()).toBe('GOODS');
    expect(q('legend')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.LEGEND');
  });

  it('labels a pre-fill as the clerk’s proposal or the vendor’s default (AC c)', () => {
    set('showClassification', true);
    set('prefill', { source: 'PROPOSAL', debitClass: 'GOODS' });
    expect(q('[data-testid="classification-note"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.FROM_PROPOSAL');
    set('prefill', { source: 'VENDOR', debitClass: 'GOODS' });
    expect(q('[data-testid="classification-note"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.FROM_VENDOR');
  });

  it('shows an EXPENSE proposal or default as set, with no choice to make (Q1 C)', () => {
    set('showClassification', true);
    set('prefill', { source: 'VENDOR', debitClass: 'EXPENSE' });

    expect(q('[data-testid="classification-expense"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.EXPENSE_VENDOR');
    expect(q('[data-testid="classification-goods"]')).toBeNull();
  });

  it('marks the field on 422 AP_BILL_UNCLASSIFIED, explains expense bills, and moves focus to it (AC a, Q1 C)', async () => {
    document.body.appendChild(host());
    set('showClassification', true);
    set('failure', failure('AP_BILL_UNCLASSIFIED', 'classification'));
    await fixture.whenStable();

    const group = q('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-invalid')).toBe('true');
    const error = q('[data-testid="classification-error"]')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(q('[data-testid="classification"]')!.getAttribute('aria-describedby')).toContain(error.id);
    expect(q('[data-testid="classification-note"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.EXPENSE_LATER');
    expect(document.activeElement).toBe(q('[data-testid="classification-goods"]'));
    host().remove();
  });

  it('quotes the served TOTALS_ADD_UP figures, computes nothing, and binds the choice and why (AC b)', () => {
    set('currency', 'USD');
    set('totals', check('TOTALS_ADD_UP', 'FAIL', { netAmount: '100.00', taxAmount: '13.00', totalAmount: '115.00', difference: '2.00' }));

    expect(q('[data-testid="difference-figures"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.DIFFERENCE.FIGURES');
    expect(fixture.componentInstance.arg('difference')).toBe('2.00');
    const choices = Array.from(host().querySelectorAll<HTMLInputElement>('[data-testid="difference-choice"]')).map(input => input.value);
    expect(choices).toEqual(['FREIGHT', 'GOODS', 'PRICE_DIFFERENCE']);
    host().querySelectorAll<HTMLInputElement>('[data-testid="difference-choice"]')[0].click();
    const why = q<HTMLTextAreaElement>('[data-testid="difference-why"]')!;
    why.value = 'Delivery charge on the invoice';
    why.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.differenceClass()).toBe('FREIGHT');
    expect(fixture.componentInstance.differenceReason()).toBe('Delivery charge on the invoice');
  });

  it('marks the group on 422 AP_BILL_TOTALS_UNRECONCILED with "Say where the {difference} goes"', () => {
    set('totals', check('TOTALS_ADD_UP', 'FAIL', { difference: '2.00' }));
    set('failure', failure('AP_BILL_TOTALS_UNRECONCILED', 'difference'));

    expect(q('[role="radiogroup"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(q('[data-testid="difference-error"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.DIFFERENCE.SAY_WHERE');
  });

  it('asks for an override reason after PERIOD_CLOSED, linked to its error (row 8)', () => {
    set('showOverride', true);
    set('failure', failure('PERIOD_CLOSED', 'override'));

    const field = q('[data-testid="override-reason"]')!;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(q('[data-testid="override-error"]')!.id);
  });
});
