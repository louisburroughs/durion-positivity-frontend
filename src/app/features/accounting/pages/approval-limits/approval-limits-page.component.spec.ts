import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ApApprovalPolicy, ApPolicyBillsUpdate, ApPolicyHistoryRow, ApPolicyRead } from '../../models/ap-approval-policy.models';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { DrawerPolicyService } from '../../services/drawer-policy.service';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { apiError, authMock } from '../bills/bills-page.spec-helper';
import { ApprovalLimitsPageComponent, classifyPolicyError, roleKey, termsCopy } from './approval-limits-page.component';

const MANAGE = ['accounting:ap_approval_policy:manage'];

const policy = (overrides: Partial<ApApprovalPolicy> = {}): ApApprovalPolicy => ({
  clerkApprovalLimit: 2500,
  autoApprovalLimit: 500,
  currencyCode: 'USD',
  allowCreatorApproval: false,
  allowApproverPayment: false,
  defaultTerms: 'NET30',
  asOf: '2026-10-06T10:00:00Z',
  ...overrides,
});

const row = (overrides: Partial<ApPolicyHistoryRow> = {}): ApPolicyHistoryRow => ({
  changedAt: '2026-10-05T15:00:00Z',
  changedBy: 'controller.cfo',
  changedByRoles: ['CONTROLLER'],
  setting: 'AP_CLERK_APPROVAL_LIMIT',
  oldValue: '1000.00',
  newValue: '2500.00',
  justification: 'Clerks handle routine parts orders',
  ...overrides,
});

const read = (overrides: Partial<ApApprovalPolicy> = {}, rows: ApPolicyHistoryRow[] = [row()]): ApPolicyRead => ({
  policy: policy(overrides),
  history: { rows, page: 0, size: 20, total: rows.length },
});

describe('ApprovalLimitsPageComponent (§5.5, §9.5)', () => {
  let fixture: ComponentFixture<ApprovalLimitsPageComponent>;
  let service: {
    getPolicy: ReturnType<typeof vi.fn<(page?: number, size?: number) => Observable<ApPolicyRead>>>;
    updatePolicy: ReturnType<typeof vi.fn<(update: ApPolicyBillsUpdate) => Observable<ApPolicyRead>>>;
  };
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const type = (selector: string, value: string): void => {
    const field = q<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  function render(held: readonly string[] | null = MANAGE): ApprovalLimitsPageComponent {
    TestBed.configureTestingModule({
      imports: [ApprovalLimitsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ApApprovalPolicyService, useValue: service },
        // Drawer and category reads are gated off for these sessions; S21's own spec drives them.
        { provide: DrawerPolicyService, useValue: { getPolicy: vi.fn(() => NEVER), updatePolicy: vi.fn() } },
        { provide: PettyExpenseCategoriesService, useValue: { list: vi.fn(() => NEVER) } },
        { provide: AuthService, useValue: authMock(held, { tenantId: signal<string | null>(null) }).service },
      ],
    });
    fixture = TestBed.createComponent(ApprovalLimitsPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    service = {
      getPolicy: vi.fn(() => of(read())),
      updatePolicy: vi.fn((update: ApPolicyBillsUpdate) =>
        of(read({ clerkApprovalLimit: update.clerkApprovalLimit, autoApprovalLimit: update.autoApprovalLimit })),
      ),
    };
  });

  it('reads the policy once and fills the Bills fields from it', () => {
    render();

    expect(service.getPolicy).toHaveBeenCalledTimes(1);
    expect(service.getPolicy).toHaveBeenCalledWith(0);
    expect(q<HTMLInputElement>('[data-testid="clerk-limit"]')!.value).toBe('2500');
    expect(q<HTMLInputElement>('[data-testid="auto-limit"]')!.value).toBe('500');
    expect(q('[data-testid="clerk-limit"]')!.getAttribute('inputmode')).toBe('decimal');
  });

  describe('validation (AC 10)', () => {
    it('an automatic limit above the clerk limit shows the inline error and disables Save', () => {
      render();
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      type('[data-testid="auto-limit"]', '3000');

      const auto = q('[data-testid="auto-limit"]')!;
      expect(q('[data-testid="auto-above-clerk"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.ERROR.AUTO_ABOVE_CLERK');
      expect(auto.getAttribute('aria-invalid')).toBe('true');
      expect(auto.getAttribute('aria-describedby')).toContain('limits-auto-error');
      expect(q<HTMLButtonElement>('[data-testid="save"]')!.disabled).toBe(true);
    });

    it('rejects a negative value or more than two decimals', () => {
      render();
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      type('[data-testid="clerk-limit"]', '-5');
      expect(q('[data-testid="clerk-error"]')).not.toBeNull();
      type('[data-testid="clerk-limit"]', '2500.123');
      expect(q('[data-testid="clerk-error"]')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="save"]')!.disabled).toBe(true);
      type('[data-testid="clerk-limit"]', '2600.50');
      expect(q('[data-testid="clerk-error"]')).toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="save"]')!.disabled).toBe(false);
    });

    it('without a reason of 10 characters Save stays disabled', () => {
      render();
      type('[data-testid="clerk-limit"]', '3000');
      expect(q<HTMLButtonElement>('[data-testid="save"]')!.disabled).toBe(true);
      type('[data-testid="save-reason"]', 'too short');
      expect(q<HTMLButtonElement>('[data-testid="save"]')!.disabled).toBe(true);
    });
  });

  describe('What this means (quotes the typed values, no arithmetic)', () => {
    it('quotes the typed limits', () => {
      render();
      type('[data-testid="clerk-limit"]', '3000');

      expect(q('[data-testid="means-clerk"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.CLERK');
      expect(fixture.componentInstance.clerk()).toBe(3000);
      expect(q('[data-testid="means-auto"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.AUTO');
    });

    it('says every bill needs a controller at a clerk limit of 0, and nothing is automatic at 0', () => {
      render();
      type('[data-testid="auto-limit"]', '0');
      type('[data-testid="clerk-limit"]', '0');

      expect(q('[data-testid="means-clerk"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.NO_CLERK');
      expect(q('[data-testid="means-auto"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.NO_AUTO');
    });

    it('shows Who can do what as action → permission, with no static role table (Q3)', () => {
      render();

      const rows = Array.from(host().querySelectorAll('[data-testid="who-row"] td')).map(cell => cell.textContent?.trim());
      expect(rows).toEqual([
        'accounting:ap:approve',
        'accounting:ap:approve_over_limit',
        'accounting:ap:reject',
        'accounting:ap:pay',
        'accounting:ap_approval_policy:manage',
      ]);
      expect(q('[data-testid="who-note"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.NOTE');
      expect(host().textContent).not.toContain('ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.CONTROLLER');
    });

    it('names a rule the tenant switched off, read-only', () => {
      service.getPolicy.mockReturnValue(of(read({ allowCreatorApproval: true })));
      render();

      expect(q('[data-testid="rule-own-bill-off"]')).not.toBeNull();
      expect(q('[data-testid="rule-own-payment-off"]')).toBeNull();
      expect(q('input[type="checkbox"]')).toBeNull();
    });
  });

  describe('Save your changes (§8.2)', () => {
    it('sends one updatePolicy with the reason and a requestId, then takes the served answer as baseline (AC 10)', () => {
      const page = render();
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      expect(service.updatePolicy).toHaveBeenCalledTimes(1);
      const sent = service.updatePolicy.mock.calls[0][0];
      expect(sent).toEqual({
        clerkApprovalLimit: 3000,
        autoApprovalLimit: 500,
        currencyCode: 'USD',
        justification: 'Busier season, more parts',
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      expect(page.baseline()?.clerkApprovalLimit).toBe(3000);
      expect(page.billsDirty()).toBe(false);
      expect(page.currentRequestId()).toBeNull();
      expect(q('[data-testid="announcement"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.SAVE.SAVED');
    });

    function failOnceThenSave(): void {
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      service.updatePolicy.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 504 })));
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();
    }

    it('a retry of the identical payload after an unknown outcome reuses the same requestId (AC 10, review A1)', () => {
      const page = render();
      failOnceThenSave();
      const first = service.updatePolicy.mock.calls[0][0].requestId;

      expect(q('[data-testid="save-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.UNKNOWN_OUTCOME');
      expect(page.currentRequestId()).toBe(first);
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      expect(service.updatePolicy.mock.calls[1][0].requestId).toBe(first);
      expect(page.currentRequestId()).toBeNull();
    });

    it('an edited payload after an unknown outcome gets a new requestId, so the edit is never dropped (review A1)', () => {
      render();
      failOnceThenSave();
      const first = service.updatePolicy.mock.calls[0][0].requestId;
      type('[data-testid="clerk-limit"]', '3600');
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      const second = service.updatePolicy.mock.calls[1][0];
      expect(second.clerkApprovalLimit).toBe(3600);
      expect(second.requestId).not.toBe(first);
    });

    it('drops the key on Undo changes', () => {
      const page = render();
      failOnceThenSave();
      q<HTMLButtonElement>('[data-testid="undo"]')!.click();
      fixture.detectChanges();

      expect(q<HTMLInputElement>('[data-testid="clerk-limit"]')!.value).toBe('2500');
      expect(page.currentRequestId()).toBeNull();
    });

    it('disables Save while a request is in flight', () => {
      render();
      const inFlight = new Subject<ApPolicyRead>();
      service.updatePolicy.mockReturnValue(inFlight);
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      expect(q<HTMLButtonElement>('[data-testid="save"]')!.disabled).toBe(true);
      fixture.componentInstance.save();
      expect(service.updatePolicy).toHaveBeenCalledTimes(1);
    });

    it('maps a server VALIDATION_ERROR onto the limit field it names', () => {
      render();
      service.updatePolicy.mockReturnValue(throwError(() => apiError(400, 'VALIDATION_ERROR', [{ field: 'autoApprovalLimit', message: 'above clerk' }])));
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      const auto = q('[data-testid="auto-limit"]')!;
      expect(auto.getAttribute('aria-invalid')).toBe('true');
      // The field names the error it is marked for (review B4).
      expect(auto.getAttribute('aria-describedby')).toContain('limits-save-error');
      expect(q('[data-testid="save-error"]')?.id).toBe('limits-save-error');
      expect(q('[data-testid="save-error"]')?.getAttribute('role')).toBe('alert');
    });

    it('a session without the manage code sees no form, and save() refuses (ADR-0040 §6a)', () => {
      const page = render(['accounting:ap:view']);

      expect(q('[data-testid="page-denied"]')).not.toBeNull();
      expect(service.getPolicy).not.toHaveBeenCalled();
      page.save();
      expect(service.updatePolicy).not.toHaveBeenCalled();
    });

    it('a token without perm_bits follows canAccess and loads the page', () => {
      render(null);

      expect(service.getPolicy).toHaveBeenCalled();
      expect(q('[data-testid="bills-section"]')).not.toBeNull();
    });
  });

  describe('History (AC 11)', () => {
    it('lists three served rows in the served order with translated roles, old → new and the reason as text (AC 11, Q4)', () => {
      service.getPolicy.mockReturnValue(
        of(
          read({}, [
            row({ changedAt: '2026-10-05T15:00:00Z', justification: '<b>Clerks</b> handle routine parts' }),
            row({ changedAt: '2026-10-04T15:00:00Z', setting: 'AP_ALLOW_CREATOR_APPROVAL', oldValue: 'false', newValue: 'true', changedByRoles: ['GENERAL_MANAGER', 'ROLE_NEW_ROLE'] }),
            row({ changedAt: '2026-10-03T15:00:00Z', setting: 'AP_DEFAULT_TERMS', oldValue: 'DUE_ON_RECEIPT', newValue: 'NET45' }),
          ]),
        ),
      );
      render();

      const rows = Array.from(host().querySelectorAll('[data-testid="history-row"]'));
      expect(rows.length).toBe(3);
      // The username is an account identifier and is never rendered (Q4).
      expect(host().textContent).not.toContain('controller.cfo');
      const who = (index: number): string[] =>
        Array.from(rows[index].querySelectorAll('[data-testid="history-who"] li')).map(item => item.textContent?.trim() ?? '');
      expect(who(0)).toEqual(['ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.CONTROLLER']);
      expect(who(1)).toEqual(['ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.GENERAL_MANAGER', 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.UNKNOWN']);
      expect(host().textContent).not.toContain('GENERAL_MANAGER,');
      expect(rows[0].querySelector('[data-testid="history-change"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_CLERK_APPROVAL_LIMIT');
      // Terms codes are translated, never shown raw (review B5).
      expect(rows[2].querySelector('[data-testid="history-change"]')?.textContent).not.toContain('NET45');
      // Rendered as text, never markup (ADR-0065).
      expect(rows[0].querySelector('[data-testid="history-reason"]')?.textContent).toBe('<b>Clerks</b> handle routine parts');
      expect(rows[0].querySelector('[data-testid="history-reason"] b')).toBeNull();
      expect(host().querySelector('[data-testid="history-table"] caption')).not.toBeNull();
    });

    it('translates role and terms codes with an Unknown fallback (review B5)', () => {
      expect(roleKey('ACCOUNTING_CLERK')).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.ACCOUNTING_CLERK');
      expect(roleKey('ROLE_CONTROLLER')).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.CONTROLLER');
      expect(roleKey('SOMETHING_NEW')).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.UNKNOWN');
      expect(termsCopy('NET45')).toEqual({ key: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.TERMS.NET', params: { days: 45 } });
      expect(termsCopy('DUE_ON_RECEIPT').key).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.TERMS.DUE_ON_RECEIPT');
      expect(termsCopy('EOM').key).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.TERMS.UNKNOWN');
    });

    it('keeps its own read status: a failed history page shows its Retry while the Bills section stays', () => {
      const page = render();
      service.getPolicy.mockReturnValue(throwError(() => apiError(500, 'INTERNAL')));
      page.retryHistory();
      fixture.detectChanges();

      expect(q('[data-testid="history-error-BILLS"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.HISTORY.SOURCE_FAILED.BILLS');
      expect(q('[data-testid="bills-section"]')).not.toBeNull();
    });
  });
});

describe('classifyPolicyError', () => {
  it.each([
    [apiError(400, 'JUSTIFICATION_REQUIRED'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.JUSTIFICATION_REQUIRED', ['justification']],
    [apiError(400, 'VALIDATION_ERROR', [{ field: 'clerkApprovalLimit', message: 'x' }]), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.VALIDATION', ['clerkApprovalLimit']],
    [apiError(400, 'VALIDATION_ERROR'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.VALIDATION_UNNAMED', []],
    [apiError(422, 'AMOUNT_PRECISION_EXCEEDS_CURRENCY'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.PRECISION', ['clerkApprovalLimit', 'autoApprovalLimit']],
    [apiError(422, 'CURRENCY_NOT_SUPPORTED'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.CURRENCY', []],
    [apiError(403, 'FORBIDDEN'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.FORBIDDEN', []],
    [new HttpErrorResponse({ status: 0 }), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.UNKNOWN_OUTCOME', []],
    [apiError(422, 'SOMETHING_NEW'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.OTHER', []],
  ])('classifies %#', (error, key, fields) => {
    const view = classifyPolicyError(error, 'USD', 'accounting:ap_approval_policy:manage');
    expect(view.key).toBe(key);
    expect(view.fields).toEqual(fields);
  });
});
