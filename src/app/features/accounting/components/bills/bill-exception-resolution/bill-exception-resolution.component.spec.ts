import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillDecisionRequest, BillDetail, BillPermissions } from '../../../models/payables.models';
import { ALL_PERMISSIONS, action, check, exceptionBill } from '../../../pages/bills/bills-page.spec-helper';
import { BillExceptionResolutionComponent } from './bill-exception-resolution.component';

describe('BillExceptionResolutionComponent (§5.2, AW6)', () => {
  let fixture: ComponentFixture<BillExceptionResolutionComponent>;
  let emitted: BillDecisionRequest[];
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const choice = (value: string): HTMLInputElement | null =>
    host().querySelector<HTMLInputElement>(`[data-choice="${value}"] input`);
  const type = (selector: string, value: string): void => {
    const field = q<HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BillExceptionResolutionComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BillExceptionResolutionComponent);
    emitted = [];
    fixture.componentInstance.decide.subscribe(request => emitted.push(request));
  });

  function render(detail: BillDetail = exceptionBill(), permissions: BillPermissions = ALL_PERMISSIONS): void {
    fixture.componentRef.setInput('bill', detail);
    fixture.componentRef.setInput('permissions', permissions);
    fixture.detectChanges();
  }

  it('offers each served choice with a required "Why?" and Resolve bill', () => {
    render();

    expect(choice('ACCEPT')).not.toBeNull();
    expect(choice('CORRECT')).not.toBeNull();
    expect(choice('VOID')).not.toBeNull();
    expect(q<HTMLButtonElement>('[data-testid="resolve"]')!.disabled).toBe(true);

    choice('CORRECT')!.click();
    fixture.detectChanges();
    type('[data-testid="exception-why"]', 'too short');
    expect(q<HTMLButtonElement>('[data-testid="resolve"]')!.disabled).toBe(true);
    type('[data-testid="exception-why"]', 'Billed quantity was a typo');
    expect(q('[data-testid="exception-consequence"]')?.textContent).toContain('ACCOUNTING.BILLS.EXCEPTION.CORRECT_CONSEQUENCE');
    q<HTMLButtonElement>('[data-testid="resolve"]')!.click();

    expect(emitted).toEqual([{ kind: 'RESOLVE', action: 'CORRECT', reason: 'Billed quantity was a typo', taxOnResale: null }]);
  });

  it('shows only served choices: Void needs accounting:ap:reject, Accept and Correct the approve codes', () => {
    render(exceptionBill(), { approve: false, reject: true, setDueDate: false, periodOverride: false });

    expect(choice('ACCEPT')).toBeNull();
    expect(choice('CORRECT')).toBeNull();
    expect(choice('VOID')).not.toBeNull();
  });

  it('offers Resolve and send for approval when Accept is blocked by the clerk limit (AC 3, §5.1)', () => {
    render(
      exceptionBill({
        availableActions: [
          action('ACCEPT_EXCEPTION', { allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED' }),
          action('CORRECT_EXCEPTION'),
          action('SUBMIT_FOR_APPROVAL'),
        ],
      }),
    );

    // Blocked but focusable, its reason described (review B1); choosing it does nothing.
    const accept = choice('ACCEPT')!;
    expect(accept.disabled).toBe(false);
    expect(accept.getAttribute('aria-disabled')).toBe('true');
    const hint = host().querySelector(`#${accept.getAttribute('aria-describedby')}`);
    expect(hint?.textContent).toContain('ACCOUNTING.BILLS.DECISION.BLOCKED.AP_APPROVAL_LIMIT_EXCEEDED');
    accept.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.choice()).toBeNull();
    expect(accept.checked).toBe(false);
    const send = q<HTMLButtonElement>('[data-testid="resolve-and-send"]')!;
    expect(send.disabled).toBe(true);
    type('[data-testid="exception-why"]', 'Price rise agreed with vendor');
    send.click();

    expect(emitted).toEqual([{ kind: 'RESOLVE_AND_SEND', reason: 'Price rise agreed with vendor' }]);
  });

  it('does not offer Resolve and send when Accept is allowed', () => {
    render();

    expect(q('[data-testid="resolve-and-send"]')).toBeNull();
  });

  it('shows the override field after a 422 AP_BILL_TAX_ON_RESALE_GOODS even when the read still shows no hold (review A6)', () => {
    render();
    choice('ACCEPT')!.click();
    fixture.detectChanges();
    expect(q('[data-testid="exception-resale"]')).toBeNull();
    fixture.componentRef.setInput('failure', {
      kind: 'RESOLVE',
      view: { code: 'AP_BILL_TAX_ON_RESALE_GOODS', message: { key: 'ACCOUNTING.BILLS.ERROR.TAX_ON_RESALE_GOODS', params: {} }, field: 'taxOnResale', reread: true, notFound: false },
    });
    fixture.detectChanges();

    expect(q('[data-testid="exception-resale"]')).not.toBeNull();
    const field = q('[data-testid="exception-resale-reason"]')!;
    expect(field.getAttribute('aria-describedby')).toContain(q('[data-testid="exception-error"]')!.id);
  });

  it('holds Accept as billed until the posting choices are complete, but not Correct', () => {
    fixture.componentRef.setInput('postingReady', false);
    render();
    choice('ACCEPT')!.click();
    fixture.detectChanges();
    type('[data-testid="exception-why"]', 'Price rise agreed with vendor');
    expect(q<HTMLButtonElement>('[data-testid="resolve"]')!.disabled).toBe(true);
    fixture.componentInstance.resolve();
    expect(emitted).toEqual([]);
    choice('CORRECT')!.click();
    fixture.detectChanges();
    expect(q<HTMLButtonElement>('[data-testid="resolve"]')!.disabled).toBe(false);
  });

  it('asks why tax on goods for resale is accepted with ACCEPT under the S43 hold', () => {
    render(exceptionBill({ checks: [check('TAX_ON_RESALE_GOODS', 'FAIL', { taxAmount: '12.40', currencyCode: 'USD' })] }));
    choice('ACCEPT')!.click();
    fixture.detectChanges();
    type('[data-testid="exception-why"]', 'Price rise agreed with vendor');

    expect(q('[data-testid="exception-resale"]')).not.toBeNull();
    expect(q<HTMLButtonElement>('[data-testid="resolve"]')!.disabled).toBe(true);
    type('[data-testid="exception-resale-reason"]', 'Resold at cost to fleet customer');
    q<HTMLButtonElement>('[data-testid="resolve"]')!.click();

    expect(emitted).toEqual([
      { kind: 'RESOLVE', action: 'ACCEPT', reason: 'Price rise agreed with vendor', taxOnResale: 'Resold at cost to fleet customer' },
    ]);
  });

  it('renders nothing outside MATCH_EXCEPTION', () => {
    render(exceptionBill({ status: 'AWAITING_APPROVAL' }));

    expect(q('[data-testid="exception-resolution"]')).toBeNull();
  });

  it('marks the field a JUSTIFICATION_REQUIRED refusal names and keeps the input', () => {
    render();
    choice('VOID')!.click();
    fixture.detectChanges();
    type('[data-testid="exception-why"]', 'Duplicate of INV-5519');
    fixture.componentRef.setInput('failure', {
      kind: 'RESOLVE',
      view: { code: 'JUSTIFICATION_REQUIRED', message: { key: 'ACCOUNTING.BILLS.ERROR.JUSTIFICATION_REQUIRED', params: { min: 10 } }, field: 'reason', reread: false, notFound: false },
    });
    fixture.detectChanges();

    expect(q('[data-testid="exception-why"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(q('[data-testid="exception-error"]')?.getAttribute('role')).toBe('alert');
    expect(q<HTMLTextAreaElement>('[data-testid="exception-why"]')!.value).toBe('Duplicate of INV-5519');
  });
});
