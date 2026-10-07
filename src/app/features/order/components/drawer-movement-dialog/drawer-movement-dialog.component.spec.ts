import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { CashMovementApprovalRequest, CashMovementRequest } from '@durion-sdk/order';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import {
  DrawerApproval,
  DrawerDialogKind,
  DrawerMovement,
  DrawerOptions,
} from '../../models/register-drawer.models';
import { RegisterSessionService } from '../../services/register-session.service';
import { DRAWER_CLOCK, DrawerMovementDialogComponent, DrawerSessionChange } from './drawer-movement-dialog.component';

const SESSION_ID = '018f2a6e-0000-7000-8000-00000000a001';

const options: DrawerOptions = {
  sessionId: SESSION_ID,
  currencyCode: 'CAD',
  reasons: [
    {
      reason: 'PETTY_EXPENSE',
      direction: 'PAID_OUT',
      allowedNow: true,
      cashierLimit: 50,
      alwaysNeedsManager: false,
      requiredFields: ['categoryCode', 'receiptReference', 'note'],
    },
    {
      reason: 'BANK_DROP',
      direction: 'PAID_OUT',
      allowedNow: true,
      cashierLimit: null,
      alwaysNeedsManager: false,
      requiredFields: ['bagNumber'],
    },
  ],
  categories: [{ code: 'OFFICE', label: 'Office supplies', examples: null }],
};

const recorded: DrawerMovement = { movementId: 'mv-1', reason: 'BANK_DROP', amount: 300, currencyCode: 'CAD' };

function refusal(status: number, code?: string, fields: readonly string[] = []): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: code ? { code, message: 'refused', status, fieldErrors: fields.map(field => ({ field, message: 'bad' })) } : null,
  });
}

interface DialogHarness {
  fixture: ComponentFixture<DrawerMovementDialogComponent>;
  component: DrawerMovementDialogComponent;
  root: HTMLElement;
  record: ReturnType<typeof vi.fn<(sessionId: string, request: CashMovementRequest) => Observable<DrawerMovement>>>;
  approve: ReturnType<
    typeof vi.fn<(sessionId: string, request: CashMovementApprovalRequest) => Observable<DrawerApproval>>
  >;
  events: {
    recorded: ReturnType<typeof vi.fn>;
    cancelled: ReturnType<typeof vi.fn>;
    sessionChanged: ReturnType<typeof vi.fn<(change: DrawerSessionChange) => void>>;
    optionsStale: ReturnType<typeof vi.fn>;
  };
  render(): void;
  q<T extends Element = HTMLElement>(testId: string): T | null;
}

function renderDialog(
  permissions: readonly string[] | null = ['order:session:view', 'order:session:cash_movement'],
  kind: DrawerDialogKind = 'PAY_OUT',
): DialogHarness {
  const granted = signal<ReadonlySet<string> | null>(permissions ? new Set(permissions) : null);
  const record = vi.fn<(sessionId: string, request: CashMovementRequest) => Observable<DrawerMovement>>();
  const approve = vi.fn<(sessionId: string, request: CashMovementApprovalRequest) => Observable<DrawerApproval>>();
  TestBed.configureTestingModule({
    imports: [DrawerMovementDialogComponent, TranslateModule.forRoot()],
    providers: [
      { provide: RegisterSessionService, useValue: { recordMovement: record, requestApproval: approve } },
      { provide: DRAWER_CLOCK, useValue: () => new Date('2026-10-07T14:00:00Z') },
      {
        provide: AuthService,
        useValue: {
          permissionsKnown: () => granted() !== null,
          hasPermission: (code: string) => granted()?.has(code) ?? false,
          hasAnyPermission: (codes: readonly string[]) => codes.some(code => granted()?.has(code) ?? false),
          hasAnyRole: () => false,
        },
      },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en-US', enUS as TranslationObject);
  translate.use('en-US');

  const fixture = TestBed.createComponent(DrawerMovementDialogComponent);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('sessionId', SESSION_ID);
  fixture.componentRef.setInput('currencyCode', 'CAD');
  fixture.componentRef.setInput('options', options);
  const component = fixture.componentInstance;
  const events = {
    recorded: vi.fn(),
    cancelled: vi.fn(),
    sessionChanged: vi.fn<(change: DrawerSessionChange) => void>(),
    optionsStale: vi.fn(),
  };
  component.recorded.subscribe(events.recorded);
  component.cancelled.subscribe(events.cancelled);
  component.sessionChanged.subscribe(events.sessionChanged);
  component.optionsStale.subscribe(events.optionsStale);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    component,
    root,
    record,
    approve,
    events,
    render: () => fixture.detectChanges(),
    q: <T extends Element = HTMLElement>(testId: string) => root.querySelector<T>(`[data-testid="${testId}"]`),
  };
}

function text(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** A complete bank drop: the shortest valid movement. */
function fillBankDrop(h: DialogHarness): void {
  h.component.chooseReason('BANK_DROP');
  h.component.bagNumber.set('BAG-7');
  h.component.amountText.set('300');
  h.render();
}

describe('DrawerMovementDialogComponent (CAP:550 S22)', () => {
  describe('the write gate at the control and in the handler (ADR-0040 §6a)', () => {
    it('renders no Record and refuses submit and approve without order:session:cash_movement', () => {
      const h = renderDialog(['order:session:view']);
      fillBankDrop(h);

      expect(h.q('drawer-record')).toBeNull();
      h.component.submitDetails();
      h.component.managerUsername.set('manager-2');
      h.component.managerPassword.set('secret');
      h.component.approve();
      expect(h.record).not.toHaveBeenCalled();
      expect(h.approve).not.toHaveBeenCalled();
    });

    it('records for a token without perm_bits (the canAccess fallback)', () => {
      const h = renderDialog(null);
      h.record.mockReturnValue(of(recorded));
      fillBankDrop(h);

      expect(h.q('drawer-record')).not.toBeNull();
      h.component.submitDetails();
      expect(h.record).toHaveBeenCalledTimes(1);
      expect(h.events.recorded).toHaveBeenCalledWith({ reason: 'BANK_DROP', amount: 300, currencyCode: 'CAD' });
    });
  });

  describe('write lock release', () => {
    it('refuses Cancel and Escape while a record is in flight, keeping the attempt until it settles', () => {
      const h = renderDialog();
      const pending$ = new Subject<DrawerMovement>();
      h.record.mockReturnValue(pending$);
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();
      expect(h.component.phase()).toBe('submitting');
      expect(h.q('drawer-cancel')!.getAttribute('aria-disabled')).toBe('true');

      h.component.cancel();
      h.root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
      expect(h.events.cancelled).not.toHaveBeenCalled();
      expect(pending$.observed).toBe(true);

      pending$.next(recorded);
      expect(h.events.recorded).toHaveBeenCalledTimes(1);
      expect(h.component.phase()).toBe('idle');
    });

    it('lets the cashier close after an unknown outcome (the id rotates on close, item 6)', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(504)));
      fillBankDrop(h);
      h.component.submitDetails();
      expect(h.component.outcomeUnknown()).toBe(true);

      h.component.cancel();
      expect(h.events.cancelled).toHaveBeenCalledTimes(1);
    });

    it('announces a failed options read through a persistent status region', () => {
      const h = renderDialog();
      const region = h.q('drawer-dialog-read-status')!;
      expect(region.getAttribute('role')).toBe('status');
      expect(text(region)).toBe('');

      h.fixture.componentRef.setInput('optionsFailed', true);
      h.render();
      expect(h.q('drawer-dialog-read-status')).toBe(region);
      expect(text(region)).toBe("Payout options couldn't be loaded");
    });

    it('releases the lock on a refusal and on a server error', () => {
      const h = renderDialog();
      h.record.mockReturnValueOnce(throwError(() => refusal(422, 'CURRENCY_NOT_SUPPORTED')));
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();
      expect(h.component.phase()).toBe('idle');
      expect(text(h.q('drawer-dialog-alert'))).toBe("This couldn't be recorded. Nothing was recorded.");

      h.record.mockReturnValueOnce(throwError(() => refusal(500)));
      h.component.submitDetails();
      expect(h.component.phase()).toBe('idle');
      expect(h.component.outcomeUnknown()).toBe(true);
    });

    it('emits nothing when destroyed with a request in flight (NG0953)', () => {
      const h = renderDialog();
      const pending$ = new Subject<DrawerMovement>();
      h.record.mockReturnValue(pending$);
      fillBankDrop(h);
      h.component.submitDetails();

      h.fixture.destroy();
      expect(pending$.observed).toBe(false);
      for (const event of Object.values(h.events)) {
        expect(event).not.toHaveBeenCalled();
      }
    });
  });

  describe('refusals', () => {
    it('names the fields a 400 lists and marks them invalid', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(400, 'REGISTER_SESSION_INVALID_ARGUMENT', ['bagNumber'])));
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();

      expect(text(h.q('drawer-dialog-alert'))).toBe(
        'Some details are missing or not valid. Nothing was recorded. Deposit bag number',
      );
      expect(h.q('drawer-bag-number')!.getAttribute('aria-invalid')).toBe('true');
    });

    it('names the missing permission on a 403 and asks the page to re-read the options', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'ORDER_FORBIDDEN')));
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();

      expect(text(h.q('drawer-dialog-alert'))).toBe(
        "You can't record drawer movements here; it needs the order:session:cash_movement permission. Nothing was recorded.",
      );
      expect(h.events.optionsStale).toHaveBeenCalledTimes(1);
    });

    it('says the drawer is outside the cashier’s locations on LOCATION_SCOPE_DENIED, not a missing permission', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'LOCATION_SCOPE_DENIED')));
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();

      expect(text(h.q('drawer-dialog-alert'))).toBe(
        "This drawer is at a location you can't work at. Nothing was recorded.",
      );
      expect(h.events.optionsStale).toHaveBeenCalledTimes(1);
    });

    it('never claims a missing permission for an unexplained 403', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'SOMETHING_NEW')));
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();

      expect(text(h.q('drawer-dialog-alert'))).toBe("This couldn't be recorded. Nothing was recorded.");
    });

    it.each([
      [refusal(404), 'GONE'],
      [refusal(409, 'REGISTER_SESSION_CONFLICT'), 'NOT_OPEN'],
      [refusal(409, 'IDEMPOTENCY_CONFLICT'), 'CONFLICT'],
    ] as const)('hands a changed session back to the page (%#)', (error, change) => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => error));
      fillBankDrop(h);
      h.component.submitDetails();

      expect(h.events.sessionChanged).toHaveBeenCalledWith(change);
    });

    it('keeps the manager step when the step-up cannot be checked, with the credentials emptied', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      h.approve.mockReturnValue(throwError(() => refusal(503, 'CASH_MOVEMENT_APPROVAL_UNAVAILABLE')));
      fillBankDrop(h);
      h.component.submitDetails();
      h.component.managerUsername.set('manager-2');
      h.component.managerPassword.set('secret');
      h.component.approve();
      h.render();

      expect(h.component.step()).toBe('approval');
      expect(text(h.q('drawer-dialog-alert'))).toBe(
        "The manager's username and password couldn't be checked just now. Nothing was approved; try again.",
      );
      expect(h.component.managerPassword()).toBe('');
      expect(h.component.managerUsername()).toBe('');
      expect(h.record).toHaveBeenCalledTimes(1);
    });

    it('keeps a step-up 400 on the manager step, naming the manager fields', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      h.approve.mockReturnValue(
        throwError(() => refusal(400, 'REGISTER_SESSION_INVALID_ARGUMENT', ['managerUsername'])),
      );
      fillBankDrop(h);
      h.component.submitDetails();
      h.component.managerUsername.set('m');
      h.component.managerPassword.set('secret');
      h.component.approve();
      h.render();

      expect(h.component.step()).toBe('approval');
      expect(text(h.q('drawer-dialog-alert'))).toBe(
        "Some details are missing or not valid. Nothing was recorded. Manager's username",
      );
      expect(h.q('drawer-manager-username')!.getAttribute('aria-invalid')).toBe('true');
      expect(h.component.managerPassword()).toBe('');
      expect(h.record).toHaveBeenCalledTimes(1);
    });

    it('keeps focus on Approve while the step-up is in flight (aria-disabled, ADR-0029 §8.7)', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      h.approve.mockReturnValue(new Subject<DrawerApproval>());
      fillBankDrop(h);
      h.component.submitDetails();
      h.render();
      h.component.managerUsername.set('manager-2');
      h.component.managerPassword.set('secret');
      h.render();
      const approve = h.q<HTMLButtonElement>('drawer-approve')!;
      approve.focus();
      approve.click();
      h.render();

      expect(h.approve).toHaveBeenCalledTimes(1);
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(approve);
      approve.click();
      expect(h.approve).toHaveBeenCalledTimes(1);
    });

    it('empties the credentials on Back', () => {
      const h = renderDialog();
      h.record.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      fillBankDrop(h);
      h.component.submitDetails();
      h.component.managerUsername.set('manager-2');
      h.component.managerPassword.set('secret');
      h.component.backToDetails();

      expect(h.component.step()).toBe('details');
      expect(h.component.managerPassword()).toBe('');
    });
  });

  it('drops a reason the server stops offering while the dialog is open', () => {
    const h = renderDialog();
    fillBankDrop(h);
    expect(h.component.reason()).toBe('BANK_DROP');

    h.fixture.componentRef.setInput('options', {
      ...options,
      reasons: options.reasons.map(option => (option.reason === 'BANK_DROP' ? { ...option, allowedNow: false } : option)),
    });
    h.render();

    expect(h.component.reason()).toBeNull();
    expect(h.root.querySelector('#drawer-reason-BANK_DROP')).toBeNull();
  });

  it('says so when nothing can be recorded this way', () => {
    const h = renderDialog(undefined, 'FLOAT');
    expect(text(h.q('drawer-none-allowed'))).toBe('Nothing can be recorded this way on this drawer right now.');
  });
});
