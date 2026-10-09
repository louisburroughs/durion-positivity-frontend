import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { CashMovementRequest } from '@durion-sdk/order';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { DrawerApproval, DrawerMovement, DrawerOptions, PendingAttempt } from '../../models/register-drawer.models';
import { DrawerAttemptStore } from '../../services/drawer-attempt.store';
import { RegisterSessionService } from '../../services/register-session.service';
import { DRAWER_CLOCK, DrawerMovementDialogComponent } from './drawer-movement-dialog.component';

const SESSION_ID = '018f2a6e-0000-7000-8000-00000000a001';

/** Placeholder regime codes only: the dialog names none itself (owner direction). */
const options = (overrides: Partial<DrawerOptions> = {}): DrawerOptions => ({
  sessionId: SESSION_ID,
  currencyCode: 'CAD',
  reasons: [
    {
      reason: 'PETTY_EXPENSE',
      direction: 'PAID_OUT',
      allowedNow: true,
      cashierLimit: 500,
      alwaysNeedsManager: false,
      requiredFields: ['categoryCode', 'receiptReference', 'note'],
    },
  ],
  categories: [
    { code: 'MEALS', label: 'Staff meals', examples: null, offeredRegimes: ['ZZ_FED', 'ZZ_REG'] },
    { code: 'POSTAGE', label: 'Postage', examples: null, offeredRegimes: [] },
  ],
  evidenceRule: { threshold: 100, currencyCode: 'CAD' },
  ...overrides,
});

const recorded: DrawerMovement = { movementId: 'mv-1', reason: 'PETTY_EXPENSE', amount: 31.5, currencyCode: 'CAD' };

function refusal(status: number, code: string, fields: readonly string[] = []): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code, message: 'refused', status, fieldErrors: fields.map(field => ({ field, message: 'bad' })) },
  });
}

interface Harness {
  fixture: ComponentFixture<DrawerMovementDialogComponent>;
  component: DrawerMovementDialogComponent;
  record: ReturnType<typeof vi.fn<(sessionId: string, request: CashMovementRequest) => Observable<DrawerMovement>>>;
  approve: ReturnType<typeof vi.fn<() => Observable<DrawerApproval>>>;
  optionsStale: ReturnType<typeof vi.fn>;
  q<T extends HTMLElement = HTMLElement>(testId: string): T | null;
  type(testId: string, value: string): void;
  select(testId: string, value: string): void;
}

/** The fixture last rendered, removed from the document after each test. */
let rendered: ComponentFixture<DrawerMovementDialogComponent> | null = null;

function renderDialog(served: DrawerOptions = options(), attempt: PendingAttempt | null = null): Harness {
  const record = vi.fn<(sessionId: string, request: CashMovementRequest) => Observable<DrawerMovement>>(() => of(recorded));
  const approve = vi.fn<() => Observable<DrawerApproval>>(() => of({ approvalToken: 'approval-token-1', expiresAt: '2026-10-07T14:05:00Z' }));
  TestBed.configureTestingModule({
    imports: [DrawerMovementDialogComponent, TranslateModule.forRoot()],
    providers: [
      { provide: RegisterSessionService, useValue: { recordMovement: record, requestApproval: approve } },
      { provide: DRAWER_CLOCK, useValue: () => new Date('2026-10-07T14:00:00Z') },
      {
        provide: AuthService,
        useValue: {
          permissionsKnown: () => true,
          hasPermission: (code: string) => code === 'order:session:cash_movement',
          hasAnyPermission: (codes: readonly string[]) => codes.includes('order:session:cash_movement'),
          hasAnyRole: () => false,
          tenantId: signal('tenant-1'),
          currentUserClaims: signal({ sub: 'cashier-1' }),
        },
      },
    ],
  });
  TestBed.inject(DrawerAttemptStore).scopeTo(SESSION_ID);
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en-US', enUS as TranslationObject);
  translate.use('en-US');
  const fixture = TestBed.createComponent(DrawerMovementDialogComponent);
  fixture.componentRef.setInput('kind', 'PAY_OUT');
  fixture.componentRef.setInput('sessionId', SESSION_ID);
  fixture.componentRef.setInput('currencyCode', 'CAD');
  fixture.componentRef.setInput('options', served);
  fixture.componentRef.setInput('attempt', attempt);
  const optionsStale = vi.fn();
  fixture.componentInstance.optionsStale.subscribe(optionsStale);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  rendered = fixture;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(testId: string): T | null => root.querySelector<T>(`[data-testid="${testId}"]`);
  return {
    fixture,
    component: fixture.componentInstance,
    record,
    approve,
    optionsStale,
    q,
    type: (testId: string, value: string) => {
      const field = q<HTMLInputElement>(testId)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    select: (testId: string, value: string) => {
      const field = q<HTMLSelectElement>(testId)!;
      field.value = value;
      field.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    },
  };
}

const text = (element: Element | null): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A petty expense of 31.50 for Staff meals, its required fields filled. */
function fillMeals(h: Harness, category = 'MEALS'): void {
  h.q<HTMLInputElement>('drawer-reason-PETTY_EXPENSE')!.click();
  h.fixture.detectChanges();
  h.select('drawer-category', category);
  h.type('drawer-amount', '31.50');
  h.type('drawer-note', 'Team lunch');
  h.type('drawer-receipt-reference', 'R-1001');
}

function recordNow(h: Harness): void {
  h.q<HTMLButtonElement>('drawer-record')!.click();
  h.fixture.detectChanges();
}

/** Lets the dialog's deferred focus moves run. */
async function settle(h: Harness): Promise<void> {
  await new Promise(resolve => setTimeout(resolve));
  h.fixture.detectChanges();
}

/**
 * The server asks for a manager; the manager approves; the second record is refused with `second`.
 * The step-up token is then held, unspent (S32d checks the stated tax before it uses the approval).
 */
async function approvedThenRefused(h: Harness, second: HttpErrorResponse): Promise<void> {
  h.record.mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
  h.record.mockReturnValueOnce(throwError(() => second));
  recordNow(h);
  await settle(h);
  h.type('drawer-manager-username', 'manager-2');
  h.type('drawer-manager-password', 'secret');
  h.q<HTMLButtonElement>('drawer-approve')!.click();
  h.fixture.detectChanges();
  await settle(h);
}

describe('DrawerMovementDialogComponent — tax on a petty-expense receipt (CAP:550 S33 item 9, AC 11)', () => {
  afterEach(() => (rendered?.nativeElement as HTMLElement | undefined)?.remove());

  it('a category with served regimes shows the supplier’s name, one field per regime and the supplier’s number, with the served threshold', () => {
    const h = renderDialog();
    fillMeals(h);

    const labels = Array.from(h.q('drawer-tax')!.querySelectorAll('label')).map(label => text(label));
    expect(text(h.q('drawer-tax')!.querySelector('legend'))).toBe('Tax on the receipt');
    expect(labels).toEqual(['Supplier’s name', 'ZZ_FED shown on the receipt', 'ZZ_REG shown on the receipt', 'Supplier’s tax registration number']);
    const fed = h.q<HTMLInputElement>('drawer-tax-ZZ_FED')!;
    expect(fed.getAttribute('inputmode')).toBe('decimal');
    expect(fed.getAttribute('aria-describedby')).toBe('drawer-tax-hint');
    expect(text(h.fixture.nativeElement.querySelector('#drawer-tax-hint'))).toBe('Copy the figure printed on the receipt. Not sure? Leave it blank.');
    expect(text(h.q('drawer-supplier-number-hint'))).toBe('Needed from CA$100.00 to claim the tax back.');
  });

  it('the hint drops the amount when no evidence rule is served', () => {
    const h = renderDialog(options({ evidenceRule: null }));
    fillMeals(h);

    expect(text(h.q('drawer-supplier-number-hint'))).toBe('Needed to claim the tax back.');
  });

  it('a category without regimes shows no tax field, and the request carries none', () => {
    const h = renderDialog();
    fillMeals(h, 'POSTAGE');

    expect(h.q('drawer-tax')).toBeNull();
    recordNow(h);
    const sent = h.record.mock.calls[0][1];
    expect(sent.statedTaxes).toBeUndefined();
    expect(sent.supplierName).toBeUndefined();
    expect(sent.supplierRegistrationNumber).toBeUndefined();
  });

  it('sends the typed figures only, as typed, with the supplier — and never compares a figure with the total (P7)', () => {
    const h = renderDialog();
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '500.00');
    h.type('drawer-supplier-name', 'Corner Deli');
    h.type('drawer-supplier-number', '123456789RT0001');

    expect(h.q<HTMLButtonElement>('drawer-record')!.disabled).toBe(false);
    recordNow(h);

    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        amount: 31.5,
        statedTaxes: [{ regime: 'ZZ_FED', amount: 500 }],
        supplierName: 'Corner Deli',
        supplierRegistrationNumber: '123456789RT0001',
      }),
    );
  });

  it('once a figure is typed the supplier’s name is required; a figure that is not an amount says so at its field', () => {
    const h = renderDialog();
    fillMeals(h);
    h.type('drawer-tax-ZZ_REG', '2.25');

    const record = h.q<HTMLButtonElement>('drawer-record')!;
    expect(record.disabled).toBe(true);
    expect(h.q('drawer-supplier-name')!.getAttribute('aria-required')).toBe('true');
    expect(text(h.fixture.nativeElement.querySelector('#drawer-supplier-name-hint'))).toBe('Needed once you type a tax figure.');

    h.type('drawer-supplier-name', 'Corner Deli');
    expect(record.disabled).toBe(false);

    h.type('drawer-tax-ZZ_REG', '2.255');
    const field = h.q('drawer-tax-ZZ_REG')!;
    expect(record.disabled).toBe(true);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('drawer-tax-hint drawer-tax-format-ZZ_REG');
    expect(text(h.q('drawer-tax-format-ZZ_REG'))).toBe('Type the figure as printed, with no more decimals than CAD uses.');
  });

  it('a 422 TAX_AMOUNT_IMPLAUSIBLE naming a figure sits at that field, linked, input kept, focus there', async () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(422, 'TAX_AMOUNT_IMPLAUSIBLE', ['statedTaxes[1].amount'])));
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '1.50');
    h.type('drawer-tax-ZZ_REG', '30.00');
    h.type('drawer-supplier-name', 'Corner Deli');
    recordNow(h);
    await new Promise(resolve => setTimeout(resolve));
    h.fixture.detectChanges();

    const field = h.q<HTMLInputElement>('drawer-tax-ZZ_REG')!;
    expect(text(h.q('drawer-tax-field-ZZ_REG')!.querySelector('[data-testid="drawer-tax-error"]'))).toBe(
      'That’s more tax than a receipt of this total can carry. Check the figure.',
    );
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('drawer-tax-hint drawer-tax-error');
    expect(field.value).toBe('30.00');
    expect(h.q<HTMLInputElement>('drawer-tax-ZZ_FED')!.getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(text(h.q('drawer-dialog-alert'))).toBe('');
  });

  it('a 422 TAX_AMOUNT_IMPLAUSIBLE on the sum sits at the tax group, describes every regime input and focuses the first (review B5)', async () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(422, 'TAX_AMOUNT_IMPLAUSIBLE', ['statedTaxes'])));
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '16.00');
    h.type('drawer-tax-ZZ_REG', '16.00');
    h.type('drawer-supplier-name', 'Corner Deli');
    recordNow(h);

    await settle(h);

    expect(h.q('drawer-tax')!.getAttribute('aria-describedby')).toBe('drawer-tax-error');
    expect(text(h.q('drawer-tax')!.querySelector(':scope > [data-testid="drawer-tax-error"]'))).toBe(
      'That’s more tax than a receipt of this total can carry. Check the figure.',
    );
    for (const regime of ['ZZ_FED', 'ZZ_REG']) {
      expect(h.q(`drawer-tax-${regime}`)!.getAttribute('aria-describedby')).toBe('drawer-tax-hint drawer-tax-error');
    }
    expect(document.activeElement).toBe(h.q('drawer-tax-ZZ_FED'));
  });

  it('a typed zero states no tax: no format error, left out of statedTaxes (review A4)', () => {
    const h = renderDialog();
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '0.00');
    h.type('drawer-tax-ZZ_REG', '2.25');
    h.type('drawer-supplier-name', 'Corner Deli');

    expect(h.q('drawer-tax-format-ZZ_FED')).toBeNull();
    expect(h.q('drawer-tax-ZZ_FED')!.getAttribute('aria-invalid')).toBeNull();
    recordNow(h);
    expect(h.record.mock.calls[0][1].statedTaxes).toEqual([{ regime: 'ZZ_REG', amount: 2.25 }]);
  });

  it('a supplier number with no tax figure blocks Record with a message at the number; nothing is sent and the approval stays held (review A1)', async () => {
    const h = renderDialog();
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '40.00');
    h.type('drawer-supplier-name', 'Corner Deli');
    h.type('drawer-supplier-number', '123456789RT0001');
    await approvedThenRefused(h, refusal(422, 'TAX_AMOUNT_IMPLAUSIBLE', ['statedTaxes[0].amount']));
    expect(h.component.holdsApproval()).toBe(true);
    expect(h.record).toHaveBeenCalledTimes(2);

    h.type('drawer-tax-ZZ_FED', '');
    const number = h.q('drawer-supplier-number')!;
    expect(text(h.q('drawer-number-needs-tax'))).toBe('Type the tax shown on the receipt to record the supplier’s number, or clear the number.');
    expect(number.getAttribute('aria-invalid')).toBe('true');
    expect(number.getAttribute('aria-describedby')).toContain('drawer-number-needs-tax');
    expect(h.q<HTMLButtonElement>('drawer-record')!.disabled).toBe(true);
    h.component.submitDetails();

    expect(h.record).toHaveBeenCalledTimes(2);
    expect(h.component.holdsApproval()).toBe(true);
    h.type('drawer-supplier-number', '');
    expect(h.q('drawer-number-needs-tax')).toBeNull();
    expect(h.q<HTMLButtonElement>('drawer-record')!.disabled).toBe(false);
  });

  it('a 400 naming only tax fields sits at the field, takes focus and keeps the unspent approval (review A2)', async () => {
    const h = renderDialog();
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '1.50');
    h.type('drawer-supplier-name', 'Corner Deli');
    h.type('drawer-supplier-number', '12 34');
    await approvedThenRefused(h, refusal(400, 'REGISTER_SESSION_INVALID_ARGUMENT', ['supplierRegistrationNumber']));

    const number = h.q('drawer-supplier-number')!;
    expect(text(number.parentElement!.querySelector('[data-testid="drawer-tax-error"]'))).toBe(
      'The supplier’s number isn’t in a form that can be recorded. Check it against the receipt, or clear it.',
    );
    expect(number.getAttribute('aria-invalid')).toBe('true');
    expect(number.getAttribute('aria-describedby')).toBe('drawer-supplier-number-hint drawer-tax-error');
    expect(document.activeElement).toBe(number);
    expect(h.component.holdsApproval()).toBe(true);
    expect(text(h.q('drawer-dialog-alert'))).toBe('');
  });

  it('a 400 naming a regime’s figure with another field stays on the general path and lists the figure by its own label (review B9)', () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(400, 'REGISTER_SESSION_INVALID_ARGUMENT', ['statedTaxes[0].amount', 'note'])));
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '1.50');
    h.type('drawer-supplier-name', 'Corner Deli');
    recordNow(h);

    expect(h.q('drawer-tax-ZZ_FED')!.getAttribute('aria-invalid')).toBe('true');
    expect(Array.from(h.q('drawer-dialog-alert')!.querySelectorAll('li')).map(item => text(item))).toEqual(['ZZ_FED shown on the receipt', 'Note']);
  });

  it('when the options re-read removes the named regime the message and focus move to the group; with no regime left, to the alert (review A3/B4)', async () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(422, 'TAX_REGIME_NOT_OFFERED', ['statedTaxes[0].regime'])));
    fillMeals(h);
    h.type('drawer-tax-ZZ_REG', '2.25');
    h.type('drawer-supplier-name', 'Corner Deli');
    recordNow(h);
    await settle(h);
    expect(document.activeElement).toBe(h.q('drawer-tax-ZZ_REG'));

    const served = options();
    h.fixture.componentRef.setInput('options', {
      ...served,
      categories: served.categories.map(category => (category.code === 'MEALS' ? { ...category, offeredRegimes: ['ZZ_FED'] } : category)),
    });
    h.fixture.detectChanges();
    await settle(h);

    const message = 'This tax can’t be stated for this category here today. The options were read again; check the figures.';
    expect(h.q('drawer-tax-ZZ_REG')).toBeNull();
    expect(text(h.q('drawer-tax')!.querySelector(':scope > [data-testid="drawer-tax-error"]'))).toBe(message);
    expect(h.q('drawer-tax-ZZ_FED')!.getAttribute('aria-describedby')).toBe('drawer-tax-hint drawer-tax-error');
    expect(document.activeElement).toBe(h.q('drawer-tax-ZZ_FED'));

    h.fixture.componentRef.setInput('options', {
      ...served,
      categories: served.categories.map(category => (category.code === 'MEALS' ? { ...category, offeredRegimes: [] } : category)),
    });
    h.fixture.detectChanges();
    await settle(h);

    expect(h.q('drawer-tax')).toBeNull();
    expect(text(h.q('drawer-dialog-alert')!.querySelector('[data-testid="drawer-tax-error"]'))).toBe(message);
    expect(document.activeElement).toBe(h.q('drawer-dialog-alert'));
  });

  it('a 503 TAX_CHECK_UNAVAILABLE says nothing was recorded; Record without the number resends without it under a new requestId', () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(503, 'TAX_CHECK_UNAVAILABLE')));
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '1.50');
    h.type('drawer-supplier-name', 'Corner Deli');
    h.type('drawer-supplier-number', '123456789RT0001');
    recordNow(h);

    expect(text(h.q('drawer-supplier-number')!.parentElement!.querySelector('[data-testid="drawer-tax-error"]'))).toBe(
      'The supplier’s number couldn’t be checked just now, so nothing was recorded. Record again, or record without the number.',
    );
    expect(h.q('drawer-supplier-number')!.getAttribute('aria-describedby')).toBe('drawer-supplier-number-hint drawer-tax-error');
    // The consequence comes before the button that commits (P4, review B3).
    const consequence = h.q('drawer-without-number-consequence')!;
    expect(text(consequence)).toBe(
      'Without the number, the tax figures are kept but none of this receipt’s tax is claimed back. From CA$100.00, the number is needed to claim it.',
    );
    expect(consequence.compareDocumentPosition(h.q('drawer-record-without-number')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    h.q<HTMLButtonElement>('drawer-record-without-number')!.click();
    h.fixture.detectChanges();

    expect(h.record).toHaveBeenCalledTimes(2);
    const [first, second] = h.record.mock.calls.map(call => call[1]);
    expect(second.supplierRegistrationNumber).toBeUndefined();
    expect(second.statedTaxes).toEqual([{ regime: 'ZZ_FED', amount: 1.5 }]);
    expect(second.requestId).not.toBe(first.requestId);
  });

  it('a 422 TAX_REGIME_NOT_OFFERED re-reads the options and marks the named field', () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(422, 'TAX_REGIME_NOT_OFFERED', ['statedTaxes[0].regime'])));
    fillMeals(h);
    h.type('drawer-tax-ZZ_REG', '2.25');
    h.type('drawer-supplier-name', 'Corner Deli');
    recordNow(h);

    expect(h.optionsStale).toHaveBeenCalledTimes(1);
    expect(h.q('drawer-tax-ZZ_REG')!.getAttribute('aria-invalid')).toBe('true');
    expect(text(h.q('drawer-tax-field-ZZ_REG')!.querySelector('[data-testid="drawer-tax-error"]'))).toBe(
      'This tax can’t be stated for this category here today. The options were read again; check the figures.',
    );
  });

  it('a 422 SUPPLIER_REGISTRATION_NOT_ACCEPTED sits at the supplier’s number', () => {
    const h = renderDialog();
    h.record.mockReturnValueOnce(throwError(() => refusal(422, 'SUPPLIER_REGISTRATION_NOT_ACCEPTED')));
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '1.50');
    h.type('drawer-supplier-name', 'Corner Deli');
    h.type('drawer-supplier-number', 'ABC');
    recordNow(h);

    expect(h.q('drawer-supplier-number')!.getAttribute('aria-invalid')).toBe('true');
    expect(text(h.q('drawer-supplier-number')!.parentElement!.querySelector('[data-testid="drawer-tax-error"]'))).toBe(
      'The supplier’s number can’t be recorded here. Clear it and record again.',
    );
    expect(h.q('drawer-record-without-number')).toBeNull();
  });

  it('without an evidence rule the Record-without-the-number consequence names no amount', () => {
    const h = renderDialog(options({ evidenceRule: null }));
    h.record.mockReturnValueOnce(throwError(() => refusal(503, 'TAX_CHECK_UNAVAILABLE')));
    fillMeals(h);
    h.type('drawer-tax-ZZ_FED', '1.50');
    h.type('drawer-supplier-name', 'Corner Deli');
    h.type('drawer-supplier-number', '123456789RT0001');
    recordNow(h);

    expect(text(h.q('drawer-without-number-consequence'))).toBe(
      'Without the number, the tax figures are kept but none of this receipt’s tax is claimed back.',
    );
  });

  it('a movement whose outcome is unknown reopens with its tax figures, supplier and number, frozen, and retries as it was', () => {
    const attempt: PendingAttempt = {
      requestId: '018f2a6e-0000-7000-8000-00000000b001',
      kind: 'PAY_OUT',
      sessionId: SESSION_ID,
      identity: 'tenant-1|cashier-1',
      draft: {
        reason: 'PETTY_EXPENSE',
        amount: 31.5,
        currencyCode: 'CAD',
        categoryCode: 'MEALS',
        note: 'Team lunch',
        receiptReference: 'R-1001',
        statedTaxes: [{ regime: 'ZZ_FED', amount: 1.5 }],
        supplierName: 'Corner Deli',
        supplierRegistrationNumber: '123456789RT0001',
      },
    };
    const h = renderDialog(options(), attempt);

    expect(h.q<HTMLInputElement>('drawer-tax-ZZ_FED')!.value).toBe('1.5');
    expect(h.q<HTMLInputElement>('drawer-tax-ZZ_FED')!.disabled).toBe(true);
    expect(h.q<HTMLInputElement>('drawer-supplier-name')!.value).toBe('Corner Deli');
    recordNow(h);

    expect(h.record.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        requestId: attempt.requestId,
        statedTaxes: [{ regime: 'ZZ_FED', amount: 1.5 }],
        supplierName: 'Corner Deli',
        supplierRegistrationNumber: '123456789RT0001',
      }),
    );
  });
});
