import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillDecisionRequest } from '../../../models/payables.models';
import { ALL_PERMISSIONS, NO_PERMISSIONS, action, bill } from '../../../pages/bills/bills-page.spec-helper';
import { BillDueDateComponent } from './bill-due-date.component';

describe('BillDueDateComponent (AW11)', () => {
  let fixture: ComponentFixture<BillDueDateComponent>;
  let emitted: BillDecisionRequest[];
  const q = <T extends HTMLElement>(selector: string): T | null => (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  const type = (selector: string, value: string): void => {
    const field = q<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BillDueDateComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BillDueDateComponent);
    emitted = [];
    fixture.componentInstance.decide.subscribe(request => emitted.push(request));
  });

  function render(permissions = ALL_PERMISSIONS, detail = bill()): void {
    fixture.componentRef.setInput('bill', detail);
    fixture.componentRef.setInput('permissions', permissions);
    fixture.detectChanges();
  }

  it('shows "No due date yet" and offers Add the vendor’s due date when SET_DUE_DATE is served', () => {
    render();

    expect(q('[data-testid="due-date-value"]')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.NO_DUE_DATE');
    expect(q('[data-testid="due-date-open"]')?.textContent).toContain('ACCOUNTING.BILLS.DUE_DATE.ADD');
  });

  it('hides the control without accounting:ap:approve, and the handler refuses (ADR-0040 §6a)', () => {
    render(NO_PERMISSIONS);

    expect(q('[data-testid="due-date-open"]')).toBeNull();
    fixture.componentInstance.open();
    expect(fixture.componentInstance.editing()).toBe(false);
  });

  it('hides the control when SET_DUE_DATE is not served', () => {
    render(ALL_PERMISSIONS, bill({ availableActions: [action('SUBMIT_FOR_APPROVAL')] }));

    expect(q('[data-testid="due-date-open"]')).toBeNull();
  });

  it('asks for a date and an optional reason of at least 10 characters', () => {
    render();
    q<HTMLButtonElement>('[data-testid="due-date-open"]')!.click();
    fixture.detectChanges();

    expect(q<HTMLButtonElement>('[data-testid="due-date-save"]')!.disabled).toBe(true);
    type('[data-testid="due-date-input"]', '2026-11-01');
    expect(q<HTMLButtonElement>('[data-testid="due-date-save"]')!.disabled).toBe(false);
    type('[data-testid="due-date-reason"]', 'short');
    expect(q<HTMLButtonElement>('[data-testid="due-date-save"]')!.disabled).toBe(true);
    type('[data-testid="due-date-reason"]', 'Vendor reissued its terms');
    q<HTMLButtonElement>('[data-testid="due-date-save"]')!.click();

    expect(emitted).toEqual([{ kind: 'DUE_DATE', dueDate: '2026-11-01', justification: 'Vendor reissued its terms' }]);
  });

  it('closes after its own decision is confirmed', () => {
    render();
    fixture.componentInstance.open();
    fixture.componentRef.setInput('done', { kind: 'DUE_DATE', seq: 1 });
    fixture.detectChanges();

    expect(fixture.componentInstance.editing()).toBe(false);
  });

  it('keeps a served-but-blocked control focusable, aria-disabled, with its reason described (review B1)', () => {
    render(ALL_PERMISSIONS, bill({ availableActions: [action('SET_DUE_DATE', { allowed: false, blockedReason: 'LATER_RULE' })] }));

    const open = q<HTMLButtonElement>('[data-testid="due-date-open"]')!;
    expect(open.disabled).toBe(false);
    expect(open.getAttribute('aria-disabled')).toBe('true');
    const hint = q('[data-testid="due-date-blocked"]')!;
    expect(open.getAttribute('aria-describedby')).toBe(hint.id);
    expect(hint.textContent).toContain('ACCOUNTING.BILLS.DECISION.BLOCKED.UNKNOWN');
    open.click();
    expect(fixture.componentInstance.editing()).toBe(false);
  });

  it('says what saving does before Save (review B2)', () => {
    render();
    fixture.componentInstance.open();
    fixture.detectChanges();

    const consequence = q('[data-testid="due-date-consequence"]')!;
    expect(consequence.textContent).toContain('ACCOUNTING.BILLS.DUE_DATE.CONSEQUENCE');
    expect(consequence.compareDocumentPosition(q('[data-testid="due-date-save"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links a server refusal on the reason to the field (review B4)', () => {
    render();
    fixture.componentInstance.open();
    fixture.componentRef.setInput('failure', {
      kind: 'DUE_DATE',
      view: { code: 'JUSTIFICATION_REQUIRED', message: { key: 'ACCOUNTING.BILLS.ERROR.JUSTIFICATION_REQUIRED', params: { min: 10 } }, field: 'reason', reread: false, notFound: false },
    });
    fixture.detectChanges();

    const reason = q('[data-testid="due-date-reason"]')!;
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(reason.getAttribute('aria-describedby')).toContain(q('[data-testid="due-date-error"]')!.id);
  });
});
