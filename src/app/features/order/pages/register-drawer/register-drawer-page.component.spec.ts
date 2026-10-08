import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { CashMovementRequestReasonEnum } from '@durion-sdk/order';
import { DrawerMovement, DrawerOptions, DrawerSession, REGISTER_TERMINAL_ID } from '../../models/register-drawer.models';
import { DrawerMovementDialogComponent } from '../../components/drawer-movement-dialog/drawer-movement-dialog.component';
import { DrawerAttemptStore } from '../../services/drawer-attempt.store';
import { RegisterDrawerPageComponent } from './register-drawer-page.component';
import {
  APPROVER_ID,
  CLERK_ID,
  OTHER_SESSION_ID,
  SESSION_ID,
  VENDOR_ID,
  approval,
  click,
  closingSession,
  drawerOptions,
  fillPettyExpense,
  flush,
  offered,
  openSession,
  pettyMovement,
  recordButton,
  refusal,
  renderDrawer,
  text,
  type,
  unknownMovement,
  vendorMovement,
  withAllowed,
} from './register-drawer-page.spec-helper';
import { DrawerHarness } from './register-drawer-page.spec-helper';

function dialog(h: DrawerHarness): DrawerMovementDialogComponent {
  const debug = h.fixture.debugElement.query(element => element.componentInstance instanceof DrawerMovementDialogComponent);
  if (!debug) {
    throw new Error('the dialog is not open');
  }
  return debug.componentInstance as DrawerMovementDialogComponent;
}

describe('RegisterDrawerPageComponent (CAP:550 S22)', () => {
  describe('AC 1: the session', () => {
    it('says no drawer is open on a 204 and offers no action', () => {
      const h = renderDrawer({ session: null });

      expect(h.mocks.currentSession).toHaveBeenCalledWith(REGISTER_TERMINAL_ID);
      expect(text(h.q('drawer-no-session'))).toBe('No drawer is open on this register.');
      expect(h.q('drawer-actions')).toBeNull();
      expect(h.mocks.movements).not.toHaveBeenCalled();
      expect(h.mocks.options).not.toHaveBeenCalled();
    });

    it('renders an OPEN session with served values or em dashes, never an id', () => {
      const h = renderDrawer({ movements: [pettyMovement, vendorMovement] });

      expect(h.component.state()).toBe('ready');
      expect(text(h.q('drawer-terminal'))).toBe('DEFAULT');
      expect(text(h.q('drawer-status'))).toBe('Open');
      expect(text(h.q('drawer-opened-by'))).toBe('—');
      // The session's own currency (CAD), never a USD fallback (ADR-0067 PC-14).
      expect(text(h.q('drawer-opening-float'))).toBe('CA$150.00');
      const rows = h.all('drawer-movement-row');
      expect(rows).toHaveLength(2);
      expect(text(h.all('drawer-movement-recorded-by')[0])).toBe('—');
      expect(text(h.all('drawer-movement-approved-by')[0])).toBe('—');
      expect(text(h.all('drawer-movement-amount')[0])).toBe('Out CA$12.50');
      expect(text(h.all('drawer-movement-details')[0])).toContain('Category: Office supplies');
      expect(text(h.all('drawer-movement-details')[0])).toContain('Receipt: R-100');
      expect(text(h.all('drawer-movement-details')[1])).toBe('Vendor: —');
      for (const id of [CLERK_ID, APPROVER_ID, VENDOR_ID, SESSION_ID]) {
        expect(h.root.textContent).not.toContain(id);
      }
      expect(text(h.q('drawer-actions'))).toContain('Pay out');
    });

    it('offers no action on a session without its own stamped currency, even when the options name one', () => {
      const h = renderDrawer({ session: { ...openSession, currencyCode: undefined } });

      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBe('true');
      expect(h.q('drawer-change-float')!.getAttribute('aria-disabled')).toBe('true');
      h.component.openPayOut();
      h.render();
      expect(h.q('drawer-dialog')).toBeNull();
      expect(text(h.q('drawer-opening-float'))).toBe('—');
    });

    it('keeps a CLOSING drawer read-only and never reads its options', () => {
      const h = renderDrawer({ session: closingSession });

      expect(text(h.q('drawer-closing'))).toBe('The drawer is being counted; payouts are closed.');
      expect(text(h.q('drawer-status'))).toBe('Being counted');
      expect(h.q('drawer-actions')).toBeNull();
      expect(h.mocks.options).not.toHaveBeenCalled();
      expect(h.all('drawer-movement-row')).toHaveLength(1);
      h.component.openPayOut();
      h.render();
      expect(h.q('drawer-dialog')).toBeNull();
    });

    it('shows the load failure with a Retry button and recovers', () => {
      const h = renderDrawer({ before: mocks => mocks.currentSession.mockReturnValue(throwError(() => refusal(500))) });
      expect(h.component.state()).toBe('error');
      expect(text(h.q('drawer-notice'))).toBe("The drawer couldn't be loaded.");
      expect(h.q('drawer-actions')).toBeNull();

      h.mocks.currentSession.mockReturnValue(of(openSession));
      click(h, 'drawer-retry');
      expect(h.component.state()).toBe('ready');
      expect(text(h.q('drawer-notice'))).toBe('');
    });
  });

  describe('AC 2 and AC 9: what Pay out offers', () => {
    it('offers only the allowed OUT reasons; vendor cash on delivery is off', () => {
      const h = renderDrawer();
      click(h, 'drawer-pay-out');

      expect(offered(h)).toEqual(['PETTY_EXPENSE', 'BANK_DROP', 'FLOAT_DECREASE']);
    });

    it('never offers vendor cash on delivery even when the policy allows it, since no vendor list is served (AC 9)', () => {
      const h = renderDrawer({ options: withAllowed(drawerOptions, 'VENDOR_COD', true) });
      click(h, 'drawer-pay-out');

      expect(offered(h)).not.toContain('VENDOR_COD');
      expect(offered(h)).toEqual(['PETTY_EXPENSE', 'BANK_DROP', 'FLOAT_DECREASE']);
    });

    it('reads a movement without a known direction as Unknown, never as Out', () => {
      const h = renderDrawer({ movements: [{ ...pettyMovement, movementType: undefined }] });
      expect(text(h.all('drawer-movement-amount')[0])).toBe('Unknown CA$12.50');
    });

    it('reads an unknown reason code as Unknown and never shows the code', () => {
      const legacy: DrawerMovement = { ...unknownMovement, movementId: 'mv-9', reason: null, note: 'Old free text' };
      const h = renderDrawer({ movements: [unknownMovement, legacy] });

      const reasons = h.all('drawer-movement-reason').map(text);
      expect(reasons).toEqual(['Unknown', 'Unknown']);
      expect(h.root.textContent).not.toContain('CUSTOMER_REFUND');
    });

    it('shows the served cashier limit on a limited reason, formatted in the drawer currency', () => {
      const h = renderDrawer();
      click(h, 'drawer-pay-out');

      expect(text(h.q('drawer-limit-PETTY_EXPENSE'))).toBe(
        'Up to CA$50.00 per drawer session without a manager; everything of this kind in the drawer counts',
      );
      expect(h.q('drawer-limit-BANK_DROP')).toBeNull();
    });

    it('offers Change the float the float reasons as directions', () => {
      const h = renderDrawer();
      click(h, 'drawer-change-float');

      expect(offered(h)).toEqual(['FLOAT_INCREASE', 'FLOAT_DECREASE']);
      expect(text(h.root.querySelector('label[for="drawer-reason-FLOAT_INCREASE"]'))).toBe('Add to the drawer');
      expect(text(h.q('drawer-float-note'))).toBe(
        'Changing the float always needs a manager. It must match the float change accounting recorded.',
      );
    });
  });

  describe('AC 3: required fields', () => {
    it('keeps Record disabled until category, receipt total, note and receipt reference are filled', () => {
      const h = renderDrawer();
      click(h, 'drawer-pay-out');
      click(h, 'drawer-reason-PETTY_EXPENSE');
      expect(recordButton(h).disabled).toBe(true);

      type(h, 'drawer-category', 'OFFICE');
      expect(recordButton(h).disabled).toBe(true);
      type(h, 'drawer-amount', '12.50');
      expect(recordButton(h).disabled).toBe(true);
      type(h, 'drawer-note', 'Printer paper');
      expect(recordButton(h).disabled).toBe(true);
      type(h, 'drawer-receipt-reference', 'R-200');
      expect(recordButton(h).disabled).toBe(false);

      type(h, 'drawer-note', '   ');
      expect(recordButton(h).disabled).toBe(true);
    });

    it('shows the never-petty help and the receipt total as tax included; no tax is computed', () => {
      const h = renderDrawer();
      fillPettyExpense(h);

      const help = h.q('drawer-never-petty')!;
      expect(help.tagName).toBe('DETAILS');
      expect(text(help)).toContain("What can't be paid from the drawer?");
      expect(text(help)).toContain('Customer refunds — use the refund screen');
      expect(text(h.root.querySelector('label[for="drawer-amount"]'))).toBe('Receipt total (tax included)');
      expect(text(h.q('drawer-consequence'))).toBe(
        "This takes CA$12.50 out of the drawer as Petty expense. Recorded payouts can't be changed or deleted.",
      );
    });

    it('requires the bag number for a bank drop', () => {
      const h = renderDrawer();
      click(h, 'drawer-pay-out');
      click(h, 'drawer-reason-BANK_DROP');
      type(h, 'drawer-amount', '300');
      expect(recordButton(h).disabled).toBe(true);
      type(h, 'drawer-bag-number', 'BAG-7');
      expect(recordButton(h).disabled).toBe(false);
    });

    it('refuses an amount with more decimals than the currency has, and a zero amount', () => {
      const h = renderDrawer();
      click(h, 'drawer-pay-out');
      click(h, 'drawer-reason-BANK_DROP');
      type(h, 'drawer-bag-number', 'BAG-7');
      type(h, 'drawer-amount', '12.505');
      expect(recordButton(h).disabled).toBe(true);
      type(h, 'drawer-amount', '0');
      expect(recordButton(h).disabled).toBe(true);
      type(h, 'drawer-amount', '12,5');
      expect(recordButton(h).disabled).toBe(false);
    });
  });

  describe('AC 4: the record request', () => {
    it('carries the reason, a requestId and the drawer currency, and never a clerkId', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(of(pettyMovement));
      fillPettyExpense(h);
      click(h, 'drawer-record');

      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(1);
      const [sessionId, request] = h.mocks.recordMovement.mock.calls[0];
      expect(sessionId).toBe(SESSION_ID);
      expect(request).toEqual({
        requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        reason: CashMovementRequestReasonEnum.PettyExpense,
        amount: 12.5,
        currencyCode: 'CAD',
        categoryCode: 'OFFICE',
        note: 'Printer paper',
        receiptReference: 'R-200',
      });
      expect(Object.keys(request)).not.toContain('clerkId');
    });

    it('sends only a bank drop’s own fields', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(of(pettyMovement));
      click(h, 'drawer-pay-out');
      click(h, 'drawer-reason-BANK_DROP');
      type(h, 'drawer-bag-number', ' BAG-7 ');
      type(h, 'drawer-amount', '300');
      click(h, 'drawer-record');

      const request = h.mocks.recordMovement.mock.calls[0][1];
      expect(request.reason).toBe(CashMovementRequestReasonEnum.BankDrop);
      expect(request.bagNumber).toBe('BAG-7');
      expect(request.categoryCode).toBeUndefined();
      expect(request.note).toBeUndefined();
    });
  });

  describe('AC 5: manager approval through the step-up', () => {
    it('records a first expense, then approves the second with one step-up and the same requestId', async () => {
      const h = renderDrawer();
      const storedBefore = { local: { ...localStorage }, session: { ...sessionStorage } };
      h.mocks.recordMovement
        .mockReturnValueOnce(of(pettyMovement))
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
        .mockReturnValueOnce(of({ ...pettyMovement, movementId: 'mv-2', amount: 45 }));
      h.mocks.requestApproval.mockReturnValue(of(approval));

      fillPettyExpense(h, '12.50');
      click(h, 'drawer-record');
      expect(h.q('drawer-dialog')).toBeNull();

      fillPettyExpense(h, '45');
      click(h, 'drawer-record');
      expect(h.q('drawer-approval')).not.toBeNull();
      expect(text(h.q('drawer-approval'))).toContain(
        'A manager needs to approve this. They enter their own username and password here and must be someone other than you.',
      );
      const secondRequestId = h.mocks.recordMovement.mock.calls[1][1].requestId;
      expect(secondRequestId).not.toBe(h.mocks.recordMovement.mock.calls[0][1].requestId);

      const password = h.q<HTMLInputElement>('drawer-manager-password')!;
      expect(password.type).toBe('password');
      expect(password.getAttribute('autocomplete')).toBe('off');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'correct horse');
      click(h, 'drawer-approve');

      expect(h.mocks.requestApproval).toHaveBeenCalledTimes(1);
      expect(h.mocks.requestApproval).toHaveBeenCalledWith(SESSION_ID, {
        managerUsername: 'manager-2',
        managerPassword: 'correct horse',
        reason: 'PETTY_EXPENSE',
        amount: 45,
        currencyCode: 'CAD',
        categoryCode: 'OFFICE',
      });
      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(3);
      const resubmission = h.mocks.recordMovement.mock.calls[2][1];
      expect(resubmission.requestId).toBe(secondRequestId);
      expect(resubmission.approvalToken).toBe('approval-token-1');
      expect(h.q('drawer-dialog')).toBeNull();

      for (const spy of Object.values(h.auth)) {
        expect(spy).not.toHaveBeenCalled();
      }
      expect({ ...localStorage }).toEqual(storedBefore.local);
      expect({ ...sessionStorage }).toEqual(storedBefore.session);
      expect(text(h.q('drawer-announcement'))).toBe('Recorded: Petty expense, CA$45.00');
    });

    it('empties the password as soon as the step-up settles, before the record answers', () => {
      const h = renderDrawer();
      const record$ = new Subject<DrawerMovement>();
      h.mocks.recordMovement
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
        .mockReturnValueOnce(record$);
      const approve$ = new Subject<typeof approval>();
      h.mocks.requestApproval.mockReturnValue(approve$);
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');
      expect(dialog(h).managerPassword()).toBe('secret');

      approve$.next(approval);
      approve$.complete();
      h.render();
      expect(dialog(h).managerPassword()).toBe('');
      expect(dialog(h).managerUsername()).toBe('');
      expect(dialog(h).holdsApproval()).toBe(true);
      expect(dialog(h).phase()).toBe('submitting');
    });
  });

  describe('AC 6: step-up refusals', () => {
    it('shows the denial, empties the credentials and holds no token; the cashier stays signed in', async () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      h.mocks.requestApproval.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_DENIED')));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'wrong');
      click(h, 'drawer-approve');
      await flush(h);

      expect(text(h.q('drawer-dialog-alert'))).toBe(
        "That didn't work. Check the username and password, and that this person can approve drawer payouts.",
      );
      expect(h.q('drawer-dialog-alert')!.getAttribute('role')).toBe('alert');
      expect(h.q<HTMLInputElement>('drawer-manager-username')!.value).toBe('');
      expect(h.q<HTMLInputElement>('drawer-manager-password')!.value).toBe('');
      expect(dialog(h).holdsApproval()).toBe(false);
      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(1);
      for (const spy of Object.values(h.auth)) {
        expect(spy).not.toHaveBeenCalled();
      }
      // Input kept: the movement's own fields survive the refusal.
      expect(dialog(h).note()).toBe('Printer paper');
    });

    it('shows the self-approval refusal', async () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      h.mocks.requestApproval.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_SELF_APPROVAL')));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'cashier-1');
      type(h, 'drawer-manager-password', 'mine');
      click(h, 'drawer-approve');

      expect(text(h.q('drawer-dialog-alert'))).toBe('The manager must be someone other than the cashier.');
      expect(h.q<HTMLInputElement>('drawer-manager-password')!.value).toBe('');
    });

    it('goes back to the manager step when the token is no longer valid', () => {
      const h = renderDrawer();
      h.mocks.recordMovement
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_INVALID')));
      h.mocks.requestApproval.mockReturnValue(of(approval));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');

      expect(h.q('drawer-approval')).not.toBeNull();
      expect(text(h.q('drawer-dialog-alert'))).toBe(
        'That approval can no longer be used. A manager needs to approve again.',
      );
      expect(dialog(h).holdsApproval()).toBe(false);
    });
  });

  describe('AC 7: a reason switched off mid-session', () => {
    it('shows the refusal, re-reads the options, drops the reason and keeps earlier expenses', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(422, 'CASH_MOVEMENT_TYPE_NOT_ALLOWED')));
      h.mocks.options.mockReturnValue(of(withAllowed(drawerOptions, 'PETTY_EXPENSE', false)));
      fillPettyExpense(h);
      expect(h.mocks.options).toHaveBeenCalledTimes(1);

      click(h, 'drawer-record');

      expect(text(h.q('drawer-dialog-alert'))).toBe(
        'Petty expense was just turned off for this drawer. Nothing was recorded.',
      );
      expect(h.mocks.options).toHaveBeenCalledTimes(2);
      expect(offered(h)).toEqual(['BANK_DROP', 'FLOAT_DECREASE']);
      expect(dialog(h).reason()).toBeNull();
      expect(h.q('drawer-fields')).toBeNull();
      expect(h.all('drawer-movement-reason').map(text)).toContain('Petty expense');
    });

    it('re-reads the options and clears a retired category', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(422, 'PETTY_EXPENSE_CATEGORY_UNKNOWN')));
      fillPettyExpense(h);
      click(h, 'drawer-record');

      expect(h.mocks.options).toHaveBeenCalledTimes(2);
      expect(dialog(h).categoryCode()).toBe('');
      expect(recordButton(h).disabled).toBe(true);
    });
  });

  describe('AC 8: Change the float', () => {
    it('asks for a manager before the first submit, then shows FLOAT_CHANGE_NOT_RECORDED', () => {
      const h = renderDrawer();
      h.mocks.requestApproval.mockReturnValue(of(approval));
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(422, 'FLOAT_CHANGE_NOT_RECORDED')));
      click(h, 'drawer-change-float');
      click(h, 'drawer-reason-FLOAT_INCREASE');
      type(h, 'drawer-amount', '50');
      expect(text(recordButton(h))).toBe('Continue to manager approval');
      expect(text(h.q('drawer-consequence'))).toBe(
        "This puts CA$50.00 into the drawer as Float increase. Recorded movements can't be changed or deleted.",
      );

      click(h, 'drawer-record');
      expect(h.mocks.recordMovement).not.toHaveBeenCalled();
      expect(h.q('drawer-approval')).not.toBeNull();

      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');

      expect(h.mocks.requestApproval.mock.calls[0][1]).toEqual({
        managerUsername: 'manager-2',
        managerPassword: 'secret',
        reason: 'FLOAT_INCREASE',
        amount: 50,
        currencyCode: 'CAD',
      });
      expect(h.mocks.recordMovement.mock.calls[0][1].approvalToken).toBe('approval-token-1');
      expect(text(h.q('drawer-dialog-alert'))).toBe("This doesn't match the float change accounting recorded.");
      expect(dialog(h).holdsApproval()).toBe(false);
    });
  });

  describe('AC 10: gates', () => {
    it('hides Pay out and Change the float without order:session:cash_movement, and their methods refuse', () => {
      const h = renderDrawer({ permissions: ['order:session:view'] });

      expect(h.q('drawer-actions')).toBeNull();
      expect(h.mocks.options).not.toHaveBeenCalled();
      h.component.openPayOut();
      h.component.openFloatChange();
      h.render();
      expect(h.component.dialogKind()).toBeNull();
      expect(h.q('drawer-dialog')).toBeNull();
      // The movements still show: the read permission alone admits the page.
      expect(h.all('drawer-movement-row')).toHaveLength(1);
    });

    it('shows the actions with the write code alone beside the read code (the split)', () => {
      const h = renderDrawer({ permissions: ['order:session:view', 'order:session:cash_movement'] });
      expect(h.q('drawer-pay-out')).not.toBeNull();
      expect(h.q('drawer-change-float')).not.toBeNull();
    });

    it('follows the canAccess fallback for a token without perm_bits', () => {
      const h = renderDrawer({ permissions: null });
      expect(h.q('drawer-pay-out')).not.toBeNull();
      expect(h.mocks.options).toHaveBeenCalledWith(SESSION_ID);
    });

    it('closes the dialog, and with it the write lock, when the write code is revoked', () => {
      const h = renderDrawer();
      const record$ = new Subject<DrawerMovement>();
      h.mocks.recordMovement.mockReturnValue(record$);
      fillPettyExpense(h);
      click(h, 'drawer-record');
      expect(record$.observed).toBe(true);

      h.granted.set(new Set(['order:session:view']));
      h.render();

      expect(h.q('drawer-dialog')).toBeNull();
      expect(h.q('drawer-actions')).toBeNull();
      expect(record$.observed).toBe(false);
    });

    it('moves focus to the page heading when a revocation removes the dialog it was in (ADR-0029 §8.7)', async () => {
      const h = renderDrawer();
      fillPettyExpense(h);
      h.q<HTMLInputElement>('drawer-note')!.focus();
      expect(document.activeElement).toBe(h.q('drawer-note'));

      h.granted.set(new Set(['order:session:view']));
      h.render();
      await flush(h);

      expect(h.q('drawer-dialog')).toBeNull();
      expect(document.activeElement).toBe(h.q('drawer-heading'));
    });

    it('re-reads the session and options when the write code comes back, clearing an options 403', () => {
      const h = renderDrawer();
      h.mocks.options.mockReturnValue(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
      h.component.onOptionsStale();
      h.render();
      expect(h.q('drawer-actions')).toBeNull();

      h.granted.set(new Set(['order:session:view']));
      h.render();
      const reread$ = new Subject<DrawerOptions>();
      h.mocks.options.mockReturnValue(reread$);
      h.granted.set(new Set(['order:session:view', 'order:session:cash_movement']));
      h.render();

      expect(h.mocks.currentSession).toHaveBeenCalledTimes(2);
      expect(h.component.optionsDenied()).toBe(false);
      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBe('true'); // pending until it answers
      reread$.next(drawerOptions);
      h.render();
      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('hands focus on when a Retry button removes itself (ADR-0029 §8.7)', async () => {
      const failing = renderDrawer({
        before: mocks => mocks.currentSession.mockReturnValue(throwError(() => refusal(500))),
      });
      failing.mocks.currentSession.mockReturnValue(new Subject<DrawerSession | null>());
      failing.q<HTMLButtonElement>('drawer-retry')!.focus();
      click(failing, 'drawer-retry');
      await flush(failing);
      expect(document.activeElement).toBe(failing.q('drawer-heading'));
    });

    it('hands focus to Pay out and to the movements heading when their Retry buttons go', async () => {
      const h = renderDrawer({
        before: mocks => {
          mocks.options.mockReturnValue(throwError(() => refusal(500)));
          mocks.movements.mockReturnValue(throwError(() => refusal(500)));
        },
      });
      h.mocks.options.mockReturnValue(new Subject<DrawerOptions>());
      h.q<HTMLButtonElement>('drawer-options-retry')!.focus();
      click(h, 'drawer-options-retry');
      await flush(h);
      expect(document.activeElement).toBe(h.q('drawer-pay-out'));

      h.mocks.movements.mockReturnValue(new Subject<DrawerMovement[]>());
      h.q<HTMLButtonElement>('drawer-movements-retry')!.focus();
      click(h, 'drawer-movements-retry');
      await flush(h);
      expect(document.activeElement).toBe(h.root.querySelector('#drawer-movements-heading'));
    });

    it('drops reads in flight when the read code goes, and reads afresh when it returns (read-only user)', () => {
      const h = renderDrawer({ permissions: ['order:session:view'] });
      const stale$ = new Subject<DrawerMovement[]>();
      h.mocks.movements.mockReturnValueOnce(stale$);
      h.component.retryMovements();

      h.granted.set(new Set());
      h.render();
      expect(stale$.observed).toBe(false);
      expect(h.component.session()).toBeNull();
      expect(h.q('drawer-summary')).toBeNull();

      h.mocks.movements.mockReturnValue(of([]));
      h.granted.set(new Set(['order:session:view']));
      h.render();
      expect(h.mocks.currentSession).toHaveBeenCalledTimes(2);
      expect(h.q('drawer-movements-empty')).not.toBeNull();
    });

    it('empties the announcement and notice when the read code is revoked (ADR-0064 §6)', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(of(pettyMovement));
      fillPettyExpense(h);
      click(h, 'drawer-record');
      expect(text(h.q('drawer-announcement'))).toBe('Recorded: Petty expense, CA$12.50');

      h.granted.set(new Set());
      h.render();

      expect(text(h.q('drawer-announcement'))).toBe('');
      expect(text(h.q('drawer-notice'))).toBe('');
    });

    it('stops rendering the drawer when the read code is revoked (ADR-0064 §6)', () => {
      const h = renderDrawer();
      h.granted.set(new Set());
      h.render();
      expect(h.q('drawer-summary')).toBeNull();
      expect(h.q('drawer-movements')).toBeNull();
    });

    it('keeps a record 403 refusal in the page alert when the options re-read then closes the dialog', async () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
      const options$ = new Subject<DrawerOptions>();
      h.mocks.options.mockReturnValue(options$);
      fillPettyExpense(h);
      click(h, 'drawer-record');
      expect(text(h.q('drawer-dialog-alert'))).toContain('it needs the order:session:cash_movement permission');

      options$.error(refusal(403, 'ORDER_FORBIDDEN'));
      h.render();
      await flush(h);

      expect(h.q('drawer-dialog')).toBeNull();
      expect(h.q('drawer-actions')).toBeNull();
      expect(text(h.q('drawer-notice'))).toBe(
        "You can't record drawer movements here; it needs the order:session:cash_movement permission. Nothing was recorded.",
      );
      expect(document.activeElement).toBe(h.q('drawer-notice'));
    });

    it('hides the actions when the options read answers 403', () => {
      const h = renderDrawer();
      h.mocks.options.mockReturnValue(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
      h.component.onOptionsStale();
      h.render();
      expect(h.q('drawer-actions')).toBeNull();
    });
  });

  describe('AC 11: one request in flight, one requestId', () => {
    it('ignores a double click and retries a timed-out record with the same requestId', async () => {
      const h = renderDrawer();
      const first$ = new Subject<DrawerMovement>();
      const second$ = new Subject<DrawerMovement>();
      h.mocks.recordMovement.mockReturnValueOnce(first$).mockReturnValueOnce(second$);
      fillPettyExpense(h);

      // The handler refuses the second click and any later submit while the first is in flight.
      recordButton(h).focus();
      recordButton(h).click();
      recordButton(h).click();
      h.render();
      dialog(h).submitDetails();
      recordButton(h).click();
      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(1);
      // aria-disabled, not disabled: the pressed button keeps focus while in flight (ADR-0029 §8.7).
      expect(recordButton(h).getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(recordButton(h));

      first$.error(refusal(504));
      h.render();
      await flush(h);
      expect(text(h.q('drawer-dialog-alert'))).toBe(
        "We couldn't confirm whether this was recorded. Retry sends the same request again, so it can't be recorded twice.",
      );
      expect(text(recordButton(h))).toBe('Retry');
      expect(document.activeElement).toBe(h.q('drawer-dialog-alert'));

      click(h, 'drawer-record');
      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(2);
      const [first, second] = h.mocks.recordMovement.mock.calls.map(call => call[1]);
      expect(second.requestId).toBe(first.requestId);

      second$.next(pettyMovement);
      second$.complete();
      h.render();
      expect(h.q('drawer-dialog')).toBeNull();
    });

    it('resends the approval token with the retry while it is valid', () => {
      const h = renderDrawer();
      h.mocks.recordMovement
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
        .mockReturnValueOnce(throwError(() => refusal(0)))
        .mockReturnValueOnce(of(pettyMovement));
      h.mocks.requestApproval.mockReturnValue(of(approval));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');
      expect(text(recordButton(h))).toBe('Retry');

      click(h, 'drawer-record');

      const calls = h.mocks.recordMovement.mock.calls.map(call => call[1]);
      expect(calls[2].approvalToken).toBe('approval-token-1');
      expect(new Set(calls.map(call => call.requestId)).size).toBe(1);
      expect(h.mocks.requestApproval).toHaveBeenCalledTimes(1);
    });

    it('records nothing when the reason is switched off while the step-up is pending', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      const approve$ = new Subject<typeof approval>();
      h.mocks.requestApproval.mockReturnValue(approve$);
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');

      h.mocks.options.mockReturnValue(of(withAllowed(drawerOptions, 'PETTY_EXPENSE', false)));
      h.component.onOptionsStale();
      h.render();
      approve$.next(approval);
      approve$.complete();
      h.render();

      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(1);
      expect(dialog(h).holdsApproval()).toBe(false);
      expect(dialog(h).reason()).toBeNull();
    });

    it('drops the approval token on a definitive 400 refusal', () => {
      const h = renderDrawer();
      h.mocks.recordMovement
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
        .mockReturnValueOnce(throwError(() => refusal(400, 'REGISTER_SESSION_INVALID_ARGUMENT', ['note'])));
      h.mocks.requestApproval.mockReturnValue(of(approval));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');

      expect(h.mocks.recordMovement.mock.calls[1][1].approvalToken).toBe('approval-token-1');
      expect(dialog(h).step()).toBe('details');
      expect(dialog(h).holdsApproval()).toBe(false);
    });

    it('drops an expired token instead of resending it', () => {
      const h = renderDrawer();
      h.mocks.recordMovement
        .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
        .mockReturnValueOnce(throwError(() => refusal(0)))
        .mockReturnValueOnce(new Subject<DrawerMovement>());
      h.mocks.requestApproval.mockReturnValue(of({ approvalToken: 'stale', expiresAt: '2026-10-07T13:59:00Z' }));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'secret');
      click(h, 'drawer-approve');
      click(h, 'drawer-record');

      expect(h.mocks.recordMovement.mock.calls[2][1].approvalToken).toBeUndefined();
      expect(dialog(h).holdsApproval()).toBe(false); // dropped when its expiry was seen, not kept until close
    });

    it('locks the fields while the outcome is unknown and retries the original movement, not an edit', () => {
      const h = renderDrawer();
      h.mocks.recordMovement
        .mockReturnValueOnce(throwError(() => refusal(504)))
        .mockReturnValueOnce(of(pettyMovement));
      fillPettyExpense(h, '12.50');
      click(h, 'drawer-record');

      expect(h.q<HTMLInputElement>('drawer-amount')!.disabled).toBe(true);
      expect(h.q<HTMLFieldSetElement>('drawer-reasons')!.disabled).toBe(true);
      dialog(h).amountText.set('99'); // an edit that slipped past the lock must not change the retry
      h.render();
      click(h, 'drawer-record');

      const [first, retry] = h.mocks.recordMovement.mock.calls.map(call => call[1]);
      expect(retry).toEqual(first);
      expect(retry.amount).toBe(12.5);
      expect(text(h.q('drawer-announcement'))).toBe('Recorded: Petty expense, CA$12.50');
    });
  });

  describe('session changes under the dialog', () => {
    it('closes on REGISTER_SESSION_CONFLICT, re-reads the session and says nothing was recorded', async () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(409, 'REGISTER_SESSION_CONFLICT')));
      h.mocks.currentSession.mockReturnValue(of(closingSession));
      fillPettyExpense(h);
      click(h, 'drawer-record');
      await flush(h);

      expect(h.q('drawer-dialog')).toBeNull();
      expect(h.mocks.currentSession).toHaveBeenCalledTimes(2);
      expect(text(h.q('drawer-notice'))).toBe('This drawer is no longer open for payouts. Nothing was recorded.');
      expect(h.q('drawer-actions')).toBeNull();
      expect(document.activeElement).toBe(h.q('drawer-notice'));
    });

    it('makes the actions wait while the session is re-resolved after a 404 (ADR-0064)', () => {
      const h = renderDrawer();
      const session$ = new Subject<DrawerSession | null>();
      h.mocks.movements.mockReturnValueOnce(throwError(() => refusal(404)));
      h.mocks.currentSession.mockReturnValue(session$);
      h.component.retryMovements();
      h.render();

      expect(h.component.sessionStatus()).toBe('PENDING');
      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBe('true');
      h.component.openPayOut();
      h.render();
      expect(h.q('drawer-dialog')).toBeNull();

      session$.next(openSession);
      h.render();
      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('marks every movements read pending, a Retry included, while keeping the rows on screen (ADR-0064 §1)', () => {
      const h = renderDrawer();
      h.mocks.movements.mockReturnValueOnce(throwError(() => refusal(500)));
      h.component.retryMovements();
      h.render();
      expect(h.component.movementsStatus()).toBe('FAILED');
      expect(h.q('drawer-movements-failed')).not.toBeNull();
      expect(h.all('drawer-movement-row')).toHaveLength(1);

      const retry$ = new Subject<DrawerMovement[]>();
      h.mocks.movements.mockReturnValueOnce(retry$);
      click(h, 'drawer-movements-retry');
      expect(h.component.movementsStatus()).toBe('PENDING');
      expect(h.q('drawer-movements-failed')).toBeNull();
      expect(h.all('drawer-movement-row')).toHaveLength(1);

      retry$.next([pettyMovement, unknownMovement]);
      h.render();
      expect(h.component.movementsStatus()).toBe('OK');
      expect(h.all('drawer-movement-row')).toHaveLength(2);
    });

    it('closes a dialog opened over a session that a re-read replaces with another (ADR-0063 §3)', async () => {
      const h = renderDrawer();
      fillPettyExpense(h);
      h.q<HTMLInputElement>('drawer-note')!.focus();
      h.mocks.currentSession.mockReturnValue(of({ ...openSession, sessionId: OTHER_SESSION_ID }));
      h.mocks.options.mockReturnValue(of({ ...drawerOptions, sessionId: OTHER_SESSION_ID }));
      h.component.loadSession();
      h.render();
      await flush(h);

      expect(h.q('drawer-dialog')).toBeNull();
      expect(document.activeElement).not.toBe(document.body);
    });

    it('re-resolves the session on a 404 from the movements read', () => {
      const h = renderDrawer({ session: openSession });
      h.mocks.movements.mockReturnValueOnce(throwError(() => refusal(404)));
      h.mocks.currentSession.mockReturnValue(of(null));
      h.component.retryMovements();
      h.render();
      expect(h.component.state()).toBe('noSession');
    });

    it('drops a superseded session’s movements when a newer session answers first (ADR-0063)', () => {
      const h = renderDrawer();
      const stale$ = new Subject<DrawerMovement[]>();
      h.mocks.movements.mockReturnValueOnce(stale$).mockReturnValueOnce(of([]));
      h.component.retryMovements();
      const next: DrawerSession = { ...openSession, sessionId: OTHER_SESSION_ID };
      h.mocks.currentSession.mockReturnValue(of(next));
      h.mocks.options.mockReturnValue(of({ ...drawerOptions, sessionId: OTHER_SESSION_ID }));
      h.component.loadSession();
      h.render();
      expect(stale$.observed).toBe(false);
      stale$.next([pettyMovement]);
      h.render();
      expect(h.q('drawer-movements-empty')).not.toBeNull();
    });
  });

  describe('options read outcomes', () => {
    it('disables the actions with a Retry when the options read fails, and keeps the movements', () => {
      const h = renderDrawer({ before: mocks => mocks.options.mockReturnValue(throwError(() => refusal(500))) });

      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBe('true');
      expect(h.q('drawer-change-float')!.getAttribute('aria-disabled')).toBe('true');
      expect(text(h.q('drawer-options-failed'))).toContain("Payout options couldn't be loaded");
      expect(h.all('drawer-movement-row')).toHaveLength(1);
      h.component.openPayOut();
      h.render();
      expect(h.q('drawer-dialog')).toBeNull();

      h.mocks.options.mockReturnValue(of(drawerOptions));
      click(h, 'drawer-options-retry');
      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBeNull();
      expect(h.q('drawer-options-failed')).toBeNull();
    });

    it('announces each failed options and movements read through a persistent status region (ADR-0029 §8.8)', () => {
      const h = renderDrawer({
        before: mocks => {
          mocks.options.mockReturnValue(throwError(() => refusal(500)));
          mocks.movements.mockReturnValue(throwError(() => refusal(500)));
        },
      });
      const region = h.q('drawer-read-status')!;
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(text(region)).toBe("Payout options couldn't be loaded The movements couldn't be loaded.");

      const options$ = new Subject<DrawerOptions>();
      const movements$ = new Subject<DrawerMovement[]>();
      h.mocks.options.mockReturnValue(options$);
      h.mocks.movements.mockReturnValue(movements$);
      click(h, 'drawer-options-retry');
      click(h, 'drawer-movements-retry');
      expect(text(region)).toBe('');

      options$.error(refusal(500));
      movements$.error(refusal(500));
      h.render();
      expect(h.q('drawer-read-status')).toBe(region);
      expect(text(region)).toBe("Payout options couldn't be loaded The movements couldn't be loaded.");
    });

    it('makes the actions wait for every options re-read, not only the first (ADR-0064 §1)', () => {
      const h = renderDrawer();
      const reread$ = new Subject<DrawerOptions>();
      h.mocks.options.mockReturnValue(reread$);
      h.component.onOptionsStale();
      h.render();

      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBe('true');
      h.component.openPayOut();
      h.render();
      expect(h.q('drawer-dialog')).toBeNull();

      reread$.next(drawerOptions);
      h.render();
      expect(h.q('drawer-pay-out')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('stops the open dialog from choosing or submitting when its options re-read fails', async () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(422, 'PETTY_EXPENSE_CATEGORY_UNKNOWN')));
      h.mocks.options.mockReturnValue(throwError(() => refusal(500)));
      fillPettyExpense(h);
      click(h, 'drawer-record');
      type(h, 'drawer-category', 'CLEANING');

      expect(text(h.q('drawer-dialog-options-failed'))).toContain("Payout options couldn't be loaded");
      expect(text(h.q('drawer-dialog-alert'))).toContain('That category can no longer be used');
      expect(recordButton(h).disabled).toBe(true);
      expect(h.q<HTMLFieldSetElement>('drawer-reasons')!.disabled).toBe(true);
      dialog(h).submitDetails();
      expect(h.mocks.recordMovement).toHaveBeenCalledTimes(1);

      h.mocks.options.mockReturnValue(of(drawerOptions));
      h.q<HTMLButtonElement>('drawer-dialog-options-retry')!.focus();
      click(h, 'drawer-dialog-options-retry');
      await flush(h);
      expect(h.q('drawer-dialog-options-failed')).toBeNull();
      expect(recordButton(h).disabled).toBe(false);
      // The Retry button went; focus is handed to the dialog title, never the document (ADR-0029 §8.7).
      expect(document.activeElement).toBe(h.q('drawer-dialog-title'));
    });
  });

  describe('identity (ADR-0063 §7)', () => {
    it('clears the page and ignores the old identity’s answers when the subject changes', () => {
      const h = renderDrawer();
      fillPettyExpense(h);
      const stale$ = new Subject<DrawerSession | null>();
      h.mocks.currentSession.mockReturnValueOnce(stale$);
      h.component.loadSession();
      h.render();
      expect(dialog(h).optionsCurrent()).toBe(false); // the open dialog waits for the re-read too

      const fresh$ = new Subject<DrawerSession | null>();
      h.mocks.currentSession.mockReturnValueOnce(fresh$);
      h.identity.set({ sub: 'cashier-2', tenant: 'tenant-1' });
      h.render();

      expect(h.q('drawer-dialog')).toBeNull();
      expect(h.component.session()).toBeNull();
      expect(stale$.observed).toBe(false);
      fresh$.next(null);
      h.render();
      expect(h.component.state()).toBe('noSession');
    });
  });

  describe('after a recording', () => {
    it('closes the dialog, announces the movement and re-reads the movements and options', () => {
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(of(pettyMovement));
      fillPettyExpense(h);
      click(h, 'drawer-record');

      expect(h.q('drawer-dialog')).toBeNull();
      expect(h.mocks.movements).toHaveBeenCalledTimes(2);
      expect(h.mocks.options).toHaveBeenCalledTimes(2);
      expect(text(h.q('drawer-announcement'))).toBe('Recorded: Petty expense, CA$12.50');
      expect(h.q('drawer-announcement')!.getAttribute('aria-live')).toBe('polite');
    });

    it('re-reads after Cancel, since a request may have landed', () => {
      const h = renderDrawer();
      click(h, 'drawer-pay-out');
      click(h, 'drawer-cancel');
      expect(h.q('drawer-dialog')).toBeNull();
      expect(h.mocks.movements).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RegisterDrawerPageComponent — a pending attempt (CAP:550 S22, item 6 amendment)', () => {
  /** A petty expense of 12.50 whose record times out: its outcome is unknown. */
  function unknownExpense(h: DrawerHarness): ReturnType<typeof requestOf> {
    h.mocks.recordMovement.mockReturnValueOnce(throwError(() => refusal(504)));
    fillPettyExpense(h);
    click(h, 'drawer-record');
    expect(dialog(h).outcomeUnknown()).toBe(true);
    return requestOf(h, 0);
  }

  function requestOf(h: DrawerHarness, call: number) {
    return h.mocks.recordMovement.mock.calls[call][1];
  }

  function store(): DrawerAttemptStore {
    return TestBed.inject(DrawerAttemptStore);
  }

  it('keeps the requestId through Cancel and reopening: same id, same payload, locked fields and Retry', async () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    click(h, 'drawer-cancel');
    expect(h.q('drawer-dialog')).toBeNull();
    expect(text(h.q('drawer-pending'))).toContain('Petty expense, CA$12.50: not confirmed yet.');

    h.mocks.recordMovement.mockReturnValueOnce(new Subject<DrawerMovement>());
    click(h, 'drawer-pay-out');
    expect(dialog(h).currentRequestId()).toBe(first.requestId);
    expect(h.q<HTMLInputElement>('drawer-amount')!.disabled).toBe(true);
    expect(h.q<HTMLInputElement>('drawer-note')!.value).toBe('Printer paper');
    expect(h.q<HTMLFieldSetElement>('drawer-reasons')!.disabled).toBe(true);
    expect(text(recordButton(h))).toBe('Retry');
    expect(text(h.q('drawer-dialog-alert'))).toContain("We couldn't confirm whether this was recorded.");

    click(h, 'drawer-record');
    expect(requestOf(h, 1)).toEqual(first);
  });

  it('keeps it through Escape, and Change the float reopens the same Pay out attempt', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    h.render();
    expect(h.q('drawer-dialog')).toBeNull();

    h.mocks.recordMovement.mockReturnValueOnce(new Subject<DrawerMovement>());
    click(h, 'drawer-change-float');
    expect(dialog(h).kind()).toBe('PAY_OUT');
    click(h, 'drawer-record');
    expect(requestOf(h, 1)).toEqual(first);
  });

  it('keeps a hung record cancelled mid-flight, and its retry carries the same id', () => {
    const h = renderDrawer();
    const hung$ = new Subject<DrawerMovement>();
    h.mocks.recordMovement.mockReturnValueOnce(hung$);
    fillPettyExpense(h);
    click(h, 'drawer-record');
    const first = requestOf(h, 0);
    click(h, 'drawer-cancel');
    expect(hung$.observed).toBe(false);
    expect(h.component.pendingAttempt()?.requestId).toBe(first.requestId);

    h.mocks.recordMovement.mockReturnValueOnce(of(pettyMovement));
    click(h, 'drawer-pay-out');
    click(h, 'drawer-record');
    expect(requestOf(h, 1)).toEqual(first);
    expect(h.component.pendingAttempt()).toBeNull();
  });

  it('keeps it when the cashier leaves the page and comes back', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    click(h, 'drawer-cancel');
    h.fixture.destroy();

    const again = TestBed.createComponent(RegisterDrawerPageComponent);
    again.detectChanges();
    expect(again.componentInstance.pendingAttempt()?.requestId).toBe(first.requestId);
    const root = again.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="drawer-pending"]')).not.toBeNull();
  });

  it('drops it on a tid|sub change', () => {
    const h = renderDrawer();
    unknownExpense(h);
    click(h, 'drawer-cancel');
    h.identity.set({ sub: 'cashier-2', tenant: 'tenant-1' });
    h.render();
    expect(h.component.pendingAttempt()).toBeNull();
    h.identity.set({ sub: 'cashier-1', tenant: 'tenant-1' });
    h.render();
    expect(h.component.pendingAttempt()).toBeNull();
    expect(store().pendingFor(SESSION_ID)).toBeNull();
  });

  it('drops it on a tid|sub change even when the other cashier\'s session read never lands', () => {
    const h = renderDrawer();
    unknownExpense(h);
    click(h, 'drawer-cancel');
    h.mocks.currentSession.mockReturnValueOnce(new Subject<DrawerSession | null>());
    h.identity.set({ sub: 'cashier-2', tenant: 'tenant-1' });
    h.render();
    h.identity.set({ sub: 'cashier-1', tenant: 'tenant-1' });
    h.render();
    expect(h.component.state()).toBe('ready');
    expect(h.component.pendingAttempt()).toBeNull();
  });

  it('drops it on a session change', () => {
    const h = renderDrawer();
    unknownExpense(h);
    click(h, 'drawer-cancel');
    h.mocks.currentSession.mockReturnValue(of({ ...openSession, sessionId: OTHER_SESSION_ID }));
    h.mocks.options.mockReturnValue(of({ ...drawerOptions, sessionId: OTHER_SESSION_ID }));
    h.component.loadSession();
    h.render();
    expect(h.component.pendingAttempt()).toBeNull();
    expect(store().pendingFor(SESSION_ID)).toBeNull();
  });

  it('settles it when a movements re-read holds its requestId, and announces it', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.mocks.movements.mockReturnValue(of([pettyMovement, { ...pettyMovement, movementId: 'mv-9', requestId: first.requestId }]));
    click(h, 'drawer-cancel');

    expect(h.component.pendingAttempt()).toBeNull();
    expect(h.q('drawer-pending')).toBeNull();
    expect(text(h.q('drawer-announcement'))).toBe('Recorded: Petty expense, CA$12.50');
  });

  it('stays settled when a movements read confirms it while the reopened retry is still in flight', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    click(h, 'drawer-cancel');
    const retry$ = new Subject<DrawerMovement>();
    h.mocks.recordMovement.mockReturnValueOnce(retry$);
    click(h, 'drawer-pay-out');
    click(h, 'drawer-record');
    expect(retry$.observed).toBe(true);

    const read$ = new Subject<DrawerMovement[]>();
    h.mocks.movements.mockReturnValueOnce(read$);
    h.component.retryMovements();
    read$.next([{ ...pettyMovement, movementId: 'mv-9', requestId: first.requestId }]);
    h.render();

    expect(h.q('drawer-dialog')).toBeNull();
    expect(retry$.observed).toBe(false);
    expect(h.component.pendingAttempt()).toBeNull();
    expect(h.q('drawer-pending')).toBeNull();
    expect(text(h.q('drawer-announcement'))).toBe('Recorded: Petty expense, CA$12.50');
  });

  it('rotates after a definite refusal of the retry', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.mocks.recordMovement.mockReturnValueOnce(throwError(() => refusal(422, 'FLOAT_CHANGE_NOT_RECORDED')));
    click(h, 'drawer-record');

    expect(h.component.pendingAttempt()).toBeNull();
    expect(dialog(h).frozen()).toBeNull();
    expect(dialog(h).currentRequestId()).not.toBe(first.requestId);
  });

  it('a plain Cancel with nothing pending starts over with a new id', () => {
    const h = renderDrawer();
    click(h, 'drawer-pay-out');
    const before = dialog(h).currentRequestId();
    click(h, 'drawer-cancel');
    click(h, 'drawer-pay-out');
    expect(dialog(h).currentRequestId()).not.toBe(before);
    expect(h.component.pendingAttempt()).toBeNull();
  });

  it('keeps the frozen reason and the attempt when that reason is switched off meanwhile (clearReason)', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.mocks.options.mockReturnValue(of(withAllowed(drawerOptions, 'PETTY_EXPENSE', false)));
    h.component.onOptionsStale();
    h.render();

    expect(dialog(h).reason()).toBe('PETTY_EXPENSE');
    expect(dialog(h).frozen()).not.toBeNull();
    expect(h.component.pendingAttempt()?.requestId).toBe(first.requestId);
    expect(recordButton(h).disabled).toBe(false);
    h.mocks.recordMovement.mockReturnValueOnce(new Subject<DrawerMovement>());
    click(h, 'drawer-record');
    expect(requestOf(h, 1)).toEqual(first);
  });

  it('keeps it after a 403 on the retry, with copy that makes no claim about the earlier attempt', async () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.mocks.recordMovement.mockReturnValueOnce(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
    const options$ = new Subject<DrawerOptions>();
    h.mocks.options.mockReturnValue(options$);
    click(h, 'drawer-record');

    expect(text(h.q('drawer-dialog-alert'))).toBe(
      "You can't record drawer movements here; it needs the order:session:cash_movement permission.",
    );
    expect(h.component.pendingAttempt()?.requestId).toBe(first.requestId);
    expect(dialog(h).outcomeUnknown()).toBe(true);

    options$.error(refusal(403, 'ORDER_FORBIDDEN'));
    h.render();
    await flush(h);
    expect(text(h.q('drawer-notice'))).toBe(
      "You can't record drawer movements here; it needs the order:session:cash_movement permission.",
    );
    expect(store().pendingFor(SESSION_ID)?.requestId).toBe(first.requestId);
  });

  it('keeps it when the retry meets a 429 that may never have reached pos-order', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.mocks.recordMovement.mockReturnValueOnce(throwError(() => refusal(429)));
    click(h, 'drawer-record');

    expect(h.component.pendingAttempt()?.requestId).toBe(first.requestId);
    expect(dialog(h).currentRequestId()).toBe(first.requestId);
    expect(text(h.q('drawer-dialog-alert'))).toBe('The drawer refused this request.');
    expect(text(recordButton(h))).toBe('Retry');
  });

  it('keeps the id through APPROVAL_REQUIRED on the retry and the approval round trip', () => {
    const h = renderDrawer();
    const first = unknownExpense(h);
    h.mocks.recordMovement
      .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
      .mockReturnValueOnce(of(pettyMovement));
    h.mocks.requestApproval.mockReturnValue(of(approval));
    click(h, 'drawer-record');
    type(h, 'drawer-manager-username', 'manager-2');
    type(h, 'drawer-manager-password', 'secret');
    click(h, 'drawer-approve');

    expect(requestOf(h, 2)).toEqual({ ...first, approvalToken: 'approval-token-1' });
    expect(h.q('drawer-dialog')).toBeNull();
  });

  it('closes on IDEMPOTENCY_CONFLICT with its own notice and settles the attempt', async () => {
    const h = renderDrawer();
    unknownExpense(h);
    h.mocks.recordMovement.mockReturnValueOnce(throwError(() => refusal(409, 'IDEMPOTENCY_CONFLICT')));
    click(h, 'drawer-record');
    await flush(h);

    expect(h.q('drawer-dialog')).toBeNull();
    expect(text(h.q('drawer-notice'))).toBe('An earlier attempt was already recorded; check the movements.');
    expect(h.component.pendingAttempt()).toBeNull();
  });
});

describe('RegisterDrawerPageComponent — focus, reads and the manager step (CAP:550 S22 review)', () => {
  it('keeps focus on Approve (aria-disabled, not disabled) while its record runs after the step-up', () => {
    const h = renderDrawer();
    h.mocks.recordMovement
      .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
      .mockReturnValueOnce(new Subject<DrawerMovement>());
    h.mocks.requestApproval.mockReturnValue(of(approval));
    fillPettyExpense(h, '80');
    click(h, 'drawer-record');
    type(h, 'drawer-manager-username', 'manager-2');
    type(h, 'drawer-manager-password', 'secret');
    const approve = h.q<HTMLButtonElement>('drawer-approve')!;
    approve.focus();
    click(h, 'drawer-approve');

    expect(dialog(h).phase()).toBe('submitting');
    expect(approve.disabled).toBe(false);
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(approve);
  });

  it('says so, and keeps the token, when a step-up lands while the options are being re-read', () => {
    const h = renderDrawer();
    h.mocks.recordMovement
      .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
      .mockReturnValueOnce(new Subject<DrawerMovement>());
    const approve$ = new Subject<typeof approval>();
    h.mocks.requestApproval.mockReturnValue(approve$);
    fillPettyExpense(h, '80');
    click(h, 'drawer-record');
    type(h, 'drawer-manager-username', 'manager-2');
    type(h, 'drawer-manager-password', 'secret');
    click(h, 'drawer-approve');
    const options$ = new Subject<DrawerOptions>();
    h.mocks.options.mockReturnValue(options$);
    h.component.onOptionsStale();
    h.render();
    approve$.next(approval);
    approve$.complete();
    h.render();

    expect(h.mocks.recordMovement).toHaveBeenCalledTimes(1);
    expect(dialog(h).step()).toBe('details');
    expect(text(h.q('drawer-dialog-alert'))).toBe(
      'A manager approved this. Press Record once the payout options have loaded.',
    );
    expect(dialog(h).holdsApproval()).toBe(true);

    options$.next(drawerOptions);
    h.render();
    click(h, 'drawer-record');
    expect(h.mocks.recordMovement.mock.calls[1][1].approvalToken).toBe('approval-token-1');
  });

  it('stops rendering movements a 403 refused, with its own message (ADR-0064 §6)', () => {
    const h = renderDrawer();
    h.mocks.movements.mockReturnValueOnce(throwError(() => refusal(403, 'LOCATION_SCOPE_DENIED')));
    h.component.retryMovements();
    h.render();

    expect(h.component.movementsFor()).toBeNull();
    expect(h.component.movements()).toEqual([]);
    expect(h.all('drawer-movement-row')).toHaveLength(0);
    expect(text(h.q('drawer-movements-denied'))).toBe("You aren't allowed to see this drawer's movements.");
    expect(h.q('drawer-movements-retry')).toBeNull();
  });

  it('gates the held options on the options 403 (ADR-0064 §6)', () => {
    const h = renderDrawer();
    expect(h.component.optionsView()).not.toBeNull();
    h.mocks.options.mockReturnValue(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
    h.component.onOptionsStale();
    expect(h.component.optionsView()).toBeNull();
  });

  it('gives a refused session read its own copy and drops what it held (ADR-0064 §6)', () => {
    const h = renderDrawer();
    h.mocks.currentSession.mockReturnValue(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
    h.component.loadSession();
    h.render();

    expect(h.component.state()).toBe('error');
    expect(h.component.session()).toBeNull();
    expect(text(h.q('drawer-notice'))).toBe(
      "You aren't allowed to see this drawer; it needs the order:session:view permission.",
    );
  });

  it('makes the wide movements table a focusable, named region', () => {
    const h = renderDrawer();
    const region = h.q('drawer-movements-region')!;
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-labelledby')).toBe('drawer-movements-heading');
  });
});

