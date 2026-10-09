import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BillDecisionRequest, BillDetail, BillPermissions } from '../../../models/payables.models';
import { ALL_PERMISSIONS, NO_PERMISSIONS, action, awaitingBill, bill, check, exceptionBill } from '../../../pages/bills/bills-page.spec-helper';
import { BillDecisionComponent } from './bill-decision.component';

describe('BillDecisionComponent (§5.2 item 4, P4, P5)', () => {
  let fixture: ComponentFixture<BillDecisionComponent>;
  let emitted: BillDecisionRequest[];
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const type = (selector: string, value: string): void => {
    const field = q<HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BillDecisionComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BillDecisionComponent);
    emitted = [];
    fixture.componentInstance.decide.subscribe(request => emitted.push(request));
  });

  function render(detail: BillDetail, permissions: BillPermissions = ALL_PERMISSIONS): void {
    fixture.componentRef.setInput('bill', detail);
    fixture.componentRef.setInput('permissions', permissions);
    fixture.detectChanges();
  }

  describe('Send for approval', () => {
    it('asks "What was this for?" without a delivery match and needs 10 characters (AC 4)', () => {
      render(bill());

      expect(host().querySelector('label[for$="-send"]')?.textContent).toContain('ACCOUNTING.BILLS.DECISION.SEND_NOTE_LABEL');
      const send = q<HTMLButtonElement>('[data-testid="send"]')!;
      expect(send.disabled).toBe(true);
      type('[data-testid="send-note"]', 'Shop rags');
      expect(send.disabled).toBe(true);
      type('[data-testid="send-note"]', 'Shop rags and gloves');
      send.click();

      expect(emitted).toEqual([{ kind: 'SUBMIT', justification: 'Shop rags and gloves' }]);
    });

    it('puts the consequence sentence before the button (P4)', () => {
      render(bill());

      const block = q('[data-testid="send-block"]')!;
      const consequence = block.querySelector('.bill-consequence')!;
      const button = block.querySelector('[data-testid="send"]')!;
      expect(consequence.textContent).toContain('ACCOUNTING.BILLS.DECISION.SEND_CONSEQUENCE');
      expect(consequence.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('is not repeated when the exception block offers Resolve and send', () => {
      render(
        exceptionBill({
          availableActions: [action('ACCEPT_EXCEPTION', { allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED' }), action('SUBMIT_FOR_APPROVAL')],
        }),
      );

      expect(q('[data-testid="send"]')).toBeNull();
    });
  });

  describe('Approve bill', () => {
    it('a creator sees Approve aria-disabled with "You can’t approve a bill you created", never enabled (AC 1)', () => {
      render(
        awaitingBill({
          availableActions: [action('SUBMIT_FOR_APPROVAL'), action('APPROVE', { allowed: false, blockedReason: 'AP_BILL_SELF_APPROVAL' })],
        }),
      );

      expect(q('[data-testid="send"]')).not.toBeNull();
      const approve = q<HTMLButtonElement>('[data-testid="approve"]')!;
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(q('[data-testid="approve-blocked"]')?.textContent).toContain('ACCOUNTING.BILLS.DECISION.BLOCKED.AP_BILL_SELF_APPROVAL');
      expect(approve.getAttribute('aria-describedby')).toBe(q('[data-testid="approve-blocked"]')!.id);
      approve.click();
      fixture.componentInstance.approve();
      expect(emitted).toEqual([]);
    });

    it('a clerk over the limit sees the limit note; an over-limit approver gets it enabled (AC 2)', () => {
      render(awaitingBill({ availableActions: [action('APPROVE', { allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED' })] }));
      expect(q('[data-testid="approve"]')!.getAttribute('aria-disabled')).toBe('true');
      expect(q('[data-testid="approve-blocked"]')?.textContent).toContain('ACCOUNTING.BILLS.DECISION.BLOCKED.AP_APPROVAL_LIMIT_EXCEEDED');

      fixture.componentRef.setInput('bill', awaitingBill({ availableActions: [action('APPROVE')] }));
      fixture.detectChanges();
      const approve = q<HTMLButtonElement>('[data-testid="approve"]')!;
      expect(approve.getAttribute('aria-disabled')).toBeNull();
      approve.click();
      expect(emitted).toEqual([{ kind: 'APPROVE', justification: null, taxOnResale: null }]);
    });

    it('requires a justification only when served as required', () => {
      render(awaitingBill({ availableActions: [action('APPROVE', { justificationRequired: true })] }));

      const approve = q<HTMLButtonElement>('[data-testid="approve"]')!;
      expect(approve.disabled).toBe(true);
      type('[data-testid="approve-reason"]', 'Matches the signed PO');
      approve.click();
      expect(emitted).toEqual([{ kind: 'APPROVE', justification: 'Matches the signed PO', taxOnResale: null }]);
    });

    it('asks why tax on goods for resale is accepted under the S43 hold, 10–1000 characters', () => {
      render(awaitingBill({ checks: [check('TAX_ON_RESALE_GOODS', 'FAIL', { taxAmount: '12.40', currencyCode: 'USD' })] }));

      expect(q('[data-testid="approve-resale"] label')?.textContent).toContain('ACCOUNTING.BILLS.DECISION.RESALE_LABEL');
      const approve = q<HTMLButtonElement>('[data-testid="approve"]')!;
      expect(approve.disabled).toBe(true);
      type('[data-testid="approve-resale-reason"]', 'Resold at cost to a fleet customer');
      approve.click();
      expect(emitted).toEqual([{ kind: 'APPROVE', justification: null, taxOnResale: 'Resold at cost to a fleet customer' }]);
    });
  });

  describe('Reject bill', () => {
    it('opens a native modal dialog whose submit needs a 10-character reason (AC 8)', () => {
      render(awaitingBill());
      document.body.appendChild(host());
      q<HTMLButtonElement>('[data-testid="reject"]')!.click();
      fixture.detectChanges();

      const dialog = q<HTMLDialogElement>('dialog[data-testid="reject-dialog"]')!;
      expect(dialog).not.toBeNull();
      expect(dialog.matches(':modal')).toBe(true);
      const confirm = q<HTMLButtonElement>('[data-testid="reject-confirm"]')!;
      expect(confirm.disabled).toBe(true);
      type('[data-testid="reject-reason"]', 'Not ours');
      expect(confirm.disabled).toBe(true);
      type('[data-testid="reject-reason"]', 'Not our order at all');
      confirm.click();
      expect(emitted).toEqual([{ kind: 'REJECT', reason: 'Not our order at all' }]);
      host().remove();
    });

    it('marks the reason on a server JUSTIFICATION_REQUIRED inside the dialog without losing it (AC 8)', () => {
      render(awaitingBill());
      fixture.componentInstance.openReject();
      fixture.detectChanges();
      type('[data-testid="reject-reason"]', 'Not our order at all');
      fixture.componentRef.setInput('failure', {
        kind: 'REJECT',
        view: { code: 'JUSTIFICATION_REQUIRED', message: { key: 'ACCOUNTING.BILLS.ERROR.JUSTIFICATION_REQUIRED', params: { min: 10 } }, field: 'reason', reread: false, notFound: false },
      });
      fixture.detectChanges();

      const error = q('dialog [data-testid="reject-error"]')!;
      expect(error.classList).toContain('dialog-error');
      expect(error.getAttribute('role')).toBe('alert');
      const reason = q<HTMLTextAreaElement>('[data-testid="reject-reason"]')!;
      expect(reason.getAttribute('aria-invalid')).toBe('true');
      expect(reason.getAttribute('aria-describedby')).toContain(error.id);
      expect(reason.value).toBe('Not our order at all');
    });

    it('returns focus to Reject bill on close (ADR-0029)', async () => {
      render(awaitingBill());
      document.body.appendChild(host());
      const trigger = q<HTMLButtonElement>('[data-testid="reject"]')!;
      trigger.focus();
      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
      q<HTMLButtonElement>('[data-testid="reject-cancel"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(q('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      host().remove();
    });

    it('closes after a confirmed reject', () => {
      render(awaitingBill());
      fixture.componentInstance.openReject();
      fixture.componentRef.setInput('done', { kind: 'REJECT', seq: 1 });
      fixture.detectChanges();

      expect(q('dialog')).toBeNull();
    });
  });

  describe('gating (ADR-0040 §6a, AC 12)', () => {
    it('renders nothing for accounting:ap:view only, and every handler refuses', () => {
      render(awaitingBill({ availableActions: [action('SUBMIT_FOR_APPROVAL'), action('APPROVE'), action('REJECT')] }), NO_PERMISSIONS);

      expect(q('[data-testid="bill-decision"]')).toBeNull();
      fixture.componentInstance.sendNote.set('Long enough reason here');
      fixture.componentInstance.send();
      fixture.componentInstance.approve();
      fixture.componentInstance.openReject();
      expect(emitted).toEqual([]);
      expect(fixture.componentInstance.dialog()).toBeNull();
    });

    it('shows Reject but not Approve to a session holding only accounting:ap:reject', () => {
      render(awaitingBill(), { approve: false, reject: true, setDueDate: false, periodOverride: false });

      expect(q('[data-testid="approve"]')).toBeNull();
      expect(q('[data-testid="reject"]')).not.toBeNull();
    });

    it('shows a control only when the bill serves its action', () => {
      render(bill({ availableActions: [] }));

      expect(q('[data-testid="bill-decision"]')).toBeNull();
    });

    it('disables the committing buttons while busy', () => {
      fixture.componentRef.setInput('busy', true);
      render(awaitingBill({ availableActions: [action('APPROVE')] }));

      expect(q<HTMLButtonElement>('[data-testid="approve"]')!.disabled).toBe(true);
      fixture.componentInstance.approve();
      expect(emitted).toEqual([]);
    });
  });

  describe('ruling rows 4–6 and review A6', () => {
    it('states what approving puts on the books: the served total and vendor, before the button (row 4)', () => {
      render(awaitingBill());

      const consequence = q('[data-testid="approve-consequence"]')!;
      expect(consequence.textContent).toContain('ACCOUNTING.BILLS.DECISION.APPROVE_CONSEQUENCE');
      expect(consequence.compareDocumentPosition(q('[data-testid="approve"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('holds Approve until the posting choices are complete', () => {
      fixture.componentRef.setInput('postingReady', false);
      render(awaitingBill());

      expect(q<HTMLButtonElement>('[data-testid="approve"]')!.disabled).toBe(true);
      fixture.componentInstance.approve();
      expect(emitted).toEqual([]);
    });

    it('voids an approved bill through a dialog with a 10-character reason (row 5)', () => {
      render(bill({ status: 'APPROVED', availableActions: [action('VOID_APPROVED')] }));
      document.body.appendChild(host());

      expect(q('[data-testid="void-approved-block"] .bill-consequence')?.textContent).toContain('ACCOUNTING.BILLS.DECISION.VOID_APPROVED_CONSEQUENCE');
      q<HTMLButtonElement>('[data-testid="void-approved"]')!.click();
      fixture.detectChanges();
      expect(q<HTMLDialogElement>('dialog[data-testid="void-dialog"]')?.matches(':modal')).toBe(true);
      type('[data-testid="void-reason"]', 'Billed twice by mistake');
      q<HTMLButtonElement>('[data-testid="void-confirm"]')!.click();

      expect(emitted).toEqual([{ kind: 'VOID', voidKind: 'VOID_APPROVED', reason: 'Billed twice by mistake', overrideJustification: null }]);
      host().remove();
    });

    it('voids a goods-receipt placeholder with its own consequence (row 6)', () => {
      render(bill({ channel: 'GOODS_RECEIPT', availableActions: [action('VOID_UNMATCHED')] }));

      expect(q('[data-testid="void-unmatched-block"] .bill-consequence')?.textContent).toContain('ACCOUNTING.BILLS.DECISION.VOID_UNMATCHED_CONSEQUENCE');
      fixture.componentInstance.openDialog('VOID_UNMATCHED');
      fixture.detectChanges();
      type('[data-testid="void-reason"]', 'No invoice will come for it');
      fixture.componentInstance.confirmDialog();

      expect(emitted).toEqual([{ kind: 'VOID', voidKind: 'VOID_UNMATCHED', reason: 'No invoice will come for it', overrideJustification: null }]);
    });

    it('hides the voids without accounting:ap:reject, and the handler refuses', () => {
      render(bill({ status: 'APPROVED', availableActions: [action('VOID_APPROVED')] }), { ...ALL_PERMISSIONS, reject: false });

      expect(q('[data-testid="void-approved"]')).toBeNull();
      fixture.componentInstance.openDialog('VOID_APPROVED');
      expect(fixture.componentInstance.dialog()).toBeNull();
    });

    it('asks a holder of accounting:period:override for an override reason after a void is refused PERIOD_CLOSED (row 8)', () => {
      render(bill({ status: 'APPROVED', availableActions: [action('VOID_APPROVED')] }));
      fixture.componentInstance.openDialog('VOID_APPROVED');
      fixture.detectChanges();
      type('[data-testid="void-reason"]', 'Billed twice by mistake');
      fixture.componentRef.setInput('revealed', { classification: false, difference: false, override: ['VOID'], taxOnResale: [] });
      fixture.componentRef.setInput('failure', {
        kind: 'VOID',
        view: { code: 'PERIOD_CLOSED', message: { key: 'ACCOUNTING.BILLS.ERROR.PERIOD_CLOSED_OVERRIDE', params: {} }, field: 'override', reread: false, notFound: false },
      });
      fixture.detectChanges();

      const override = q<HTMLTextAreaElement>('[data-testid="void-override-reason"]')!;
      expect(override.getAttribute('aria-invalid')).toBe('true');
      expect(override.getAttribute('aria-describedby')).toContain(q('[data-testid="void-error"]')!.id);
      expect(q<HTMLButtonElement>('[data-testid="void-confirm"]')!.disabled).toBe(true);
      type('[data-testid="void-override-reason"]', 'September closed before the vendor credit');
      fixture.componentInstance.confirmDialog();

      expect(emitted).toEqual([
        { kind: 'VOID', voidKind: 'VOID_APPROVED', reason: 'Billed twice by mistake', overrideJustification: 'September closed before the vendor credit' },
      ]);
    });

    it('shows the S43 override after a 422 AP_BILL_TAX_ON_RESALE_GOODS while the read shows no hold (review A6)', () => {
      render(awaitingBill());
      expect(q('[data-testid="approve-resale"]')).toBeNull();
      fixture.componentRef.setInput('revealed', { classification: false, difference: false, override: [], taxOnResale: ['APPROVE'] });
      fixture.componentRef.setInput('failure', {
        kind: 'APPROVE',
        view: { code: 'AP_BILL_TAX_ON_RESALE_GOODS', message: { key: 'ACCOUNTING.BILLS.ERROR.TAX_ON_RESALE_GOODS', params: {} }, field: 'taxOnResale', reread: true, notFound: false },
      });
      fixture.detectChanges();

      const field = q('[data-testid="approve-resale-reason"]')!;
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.getAttribute('aria-describedby')).toContain(q('[data-testid="approve-error"]')!.id);
    });

    it('leaves a posting-field refusal to the posting block (no duplicate alert)', () => {
      render(awaitingBill());
      fixture.componentRef.setInput('failure', {
        kind: 'APPROVE',
        view: { code: 'AP_BILL_UNCLASSIFIED', message: { key: 'ACCOUNTING.BILLS.ERROR.UNCLASSIFIED', params: {} }, field: 'classification', reread: false, notFound: false },
      });
      fixture.detectChanges();

      expect(q('[data-testid="approve-error"]')).toBeNull();
    });
  });

  it('keeps a revealed field after the failure clears, so a retry resends it (R2 item 2)', () => {
    render(awaitingBill());
    fixture.componentRef.setInput('revealed', { classification: false, difference: false, override: [], taxOnResale: ['APPROVE'] });
    fixture.componentRef.setInput('failure', null);
    fixture.detectChanges();
    type('[data-testid="approve-resale-reason"]', 'Resold at cost to a fleet customer');
    fixture.componentInstance.approve();

    expect(emitted).toEqual([{ kind: 'APPROVE', justification: null, taxOnResale: 'Resold at cost to a fleet customer' }]);
  });
});
