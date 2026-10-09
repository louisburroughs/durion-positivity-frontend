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
});
