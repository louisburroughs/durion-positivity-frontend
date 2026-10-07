import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoItem } from '../../models/accounting-home.models';
import {
  awaitingApproval,
  bankLine,
  payment,
  review,
  submittedRow,
} from '../../pages/home/accounting-home-page.spec-helper';
import {
  configurePayments,
  createPaymentsMocks,
} from '../../pages/customer-payments/customer-payments-page.spec-helper';
import { paymentMethodKey, paymentReasonKey } from '../../utils/payment-match';
import { PaymentMatchComponent } from '../payment-match/payment-match.component';
import { TodoDetailPanelComponent } from './todo-detail-panel.component';

describe('TodoDetailPanelComponent (§5.1 detail panel templates)', () => {
  let fixture: ComponentFixture<TodoDetailPanelComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    configurePayments(createPaymentsMocks(), { tenantId: signal<string | null>('tenant-a') });
    TestBed.configureTestingModule({
      imports: [TodoDetailPanelComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(TodoDetailPanelComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function show(item: TodoItem, inputs: Record<string, unknown> = {}): void {
    fixture.componentRef.setInput('item', item);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  const text = (selector: string): string => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  describe('Payment ready to match (CAP:550 S6 AC 11)', () => {
    it('embeds the Customer payments match panel, with What to do and the help disclosure', () => {
      show({ kind: 'PAYMENT', id: 'PAYMENT:pay-1', payment: payment() });

      expect(text('#todo-panel-heading')).toBe('ACCOUNTING.HOME.TODO.PAYMENT.PANEL_TITLE');
      expect(host.textContent).toContain('ACCOUNTING.HOME.TODO.WHAT_TO_DO');
      expect(host.querySelector('app-help-disclosure details')).not.toBeNull();
      const match = fixture.debugElement.query(debug => debug.componentInstance instanceof PaymentMatchComponent);
      expect(match).not.toBeNull();
      const instance = match.componentInstance as PaymentMatchComponent;
      expect(instance.payment().paymentId).toBe('pay-1');
      expect(instance.embedded()).toBe(true);
      // Embedded: the panel's h3 heads it; the match panel adds no h2 of its own.
      expect(host.querySelector('h2')).toBeNull();
      expect(host.querySelector('[data-testid="apply"]')).not.toBeNull();
    });

    it('forwards the match panel’s outcomes to the home', () => {
      show({ kind: 'PAYMENT', id: 'PAYMENT:pay-1', payment: payment() });
      const panel = fixture.componentInstance;
      const seen: string[] = [];
      panel.paymentApplied.subscribe(event => seen.push(`applied:${event.paymentId}`));
      panel.paymentChanged.subscribe(() => seen.push('changed'));
      panel.paymentAnnounce.subscribe(message => seen.push(message.key));
      const match = fixture.debugElement.query(debug => debug.componentInstance instanceof PaymentMatchComponent)
        .componentInstance as PaymentMatchComponent;

      match.applied.emit({ paymentId: 'pay-1' });
      match.changed.emit();
      match.announce.emit({ key: 'K', params: {}, tone: 'success' });

      expect(seen).toEqual(['applied:pay-1', 'changed', 'K']);
    });
  });

  describe('Bank line not in the books', () => {
    it('sends the line to its account’s open check-up when one is in progress', () => {
      show(
        { kind: 'BANK_LINE', id: 'BANK_LINE:bt-1', line: bankLine() },
        { bankRows: [{ ...submittedRow, status: 'IN_PROGRESS', reconciliationId: 'rec-open' }] },
      );
      expect(host.querySelector('a.todo-panel__action')?.getAttribute('href')).toBe('/app/accounting/reconciliations/rec-open');
    });

    it('falls back to the bank accounts page without an open check-up', () => {
      show({ kind: 'BANK_LINE', id: 'BANK_LINE:bt-1', line: bankLine() }, { bankRows: [submittedRow] });
      expect(host.querySelector('a.todo-panel__action')?.getAttribute('href')).toBe('/app/accounting/bank-accounts');
    });
  });

  describe('Bank check-up needs approval', () => {
    const approvalItem: TodoItem = { kind: 'APPROVAL', id: 'APPROVAL:rec-9', checkup: awaitingApproval() };

    it('hides Approve month without the approve permission (P5: missing permission hides)', () => {
      show(approvalItem, { canApprove: false, review: review(true), reviewStatus: 'OK' });
      expect(host.querySelector('[data-testid="approve-month"]')).toBeNull();
    });

    it('enables Approve month when the served review says it can be approved', () => {
      show(approvalItem, { canApprove: true, review: review(true), reviewStatus: 'OK' });
      const button = host.querySelector('[data-testid="approve-month"]')!;
      expect(button.getAttribute('aria-disabled')).toBeNull();
      expect(button.getAttribute('aria-describedby')).toBe('approve-consequence');
      let emitted = 0;
      fixture.componentInstance.approve.subscribe(() => emitted++);
      (button as HTMLButtonElement).click();
      expect(emitted).toBe(1);
    });

    it('keeps a blocked Approve month visible, aria-disabled, described by its served reasons, and silent', () => {
      show(approvalItem, { canApprove: true, review: review(false, ['SELF_APPROVAL', 'PROPOSALS_PENDING']), reviewStatus: 'OK' });
      const button = host.querySelector('[data-testid="approve-month"]')!;
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-describedby')).toBe('approve-consequence approve-reasons');
      expect(Array.from(host.querySelectorAll('[data-testid="approve-reasons"] li')).map(li => li.getAttribute('data-reason'))).toEqual([
        'SELF_APPROVAL',
      ]);
      let emitted = 0;
      fixture.componentInstance.approve.subscribe(() => emitted++);
      (button as HTMLButtonElement).click();
      expect(emitted).toBe(0);
    });

    it('stays disabled while approving and while the review is unread', () => {
      show(approvalItem, { canApprove: true, review: review(true), reviewStatus: 'OK', approving: true });
      expect(host.querySelector('[data-testid="approve-month"]')!.getAttribute('aria-disabled')).toBe('true');

      fixture.componentRef.setInput('approving', false);
      fixture.componentRef.setInput('reviewStatus', 'FAILED');
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="approve-month"]')!.getAttribute('aria-disabled')).toBe('true');
      expect(text('.field-error')).toBe('ACCOUNTING.HOME.TODO.APPROVAL.REVIEW_FAILED');
    });

    it('announces the outcome in a live region that is always present', () => {
      show(approvalItem, { canApprove: true });
      const region = host.querySelector('[data-testid="approve-outcome"]')!;
      expect(region.getAttribute('aria-live')).toBe('polite');

      fixture.componentRef.setInput('approveMessageKey', 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.OTHER');
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="approve-outcome"]')).toBe(region);
      expect(region.textContent).toContain('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.OTHER');
    });

    it('moves focus to its heading on request', () => {
      document.body.appendChild(host);
      show(approvalItem);
      fixture.componentInstance.focusHeading();
      expect(document.activeElement?.id).toBe('todo-panel-heading');
      host.remove();
    });
  });

  it('maps unknown reason and method codes to Unknown, and a missing method to nothing', () => {
    expect(paymentReasonKey('BRAND_NEW')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.REASON.UNKNOWN');
    expect(paymentMethodKey('WIRE')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.UNKNOWN');
    expect(paymentMethodKey(null)).toBeNull();
  });
});
