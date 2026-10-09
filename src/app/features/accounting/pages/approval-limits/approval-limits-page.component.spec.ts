import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ApApprovalPolicy, ApPolicyBillsUpdate, ApPolicyHistoryRow, ApPolicyRead } from '../../models/ap-approval-policy.models';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { apiError, authMock } from '../bills/bills-page.spec-helper';
import { ApprovalLimitsPageComponent, classifyPolicyError } from './approval-limits-page.component';

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
  changedBy: 'Dana Reyes',
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
      const requestId = page.currentRequestId();
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      expect(service.updatePolicy).toHaveBeenCalledTimes(1);
      expect(service.updatePolicy).toHaveBeenCalledWith({
        clerkApprovalLimit: 3000,
        autoApprovalLimit: 500,
        currencyCode: 'USD',
        justification: 'Busier season, more parts',
        requestId,
      });
      expect(page.baseline()?.clerkApprovalLimit).toBe(3000);
      expect(page.billsDirty()).toBe(false);
      expect(page.currentRequestId()).toBeNull();
      expect(q('[data-testid="announcement"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.SAVE.SAVED');
    });

    it('a retry after an unknown outcome reuses the same requestId (AC 10)', () => {
      const page = render();
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="save-reason"]', 'Busier season, more parts');
      service.updatePolicy.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 504 })));
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();
      const first = service.updatePolicy.mock.calls[0][0].requestId;

      expect(q('[data-testid="save-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.UNKNOWN_OUTCOME');
      q<HTMLButtonElement>('[data-testid="save"]')!.click();
      fixture.detectChanges();

      expect(service.updatePolicy.mock.calls[1][0].requestId).toBe(first);
      expect(page.currentRequestId()).toBeNull();
    });

    it('rotates the requestId after Undo changes', () => {
      const page = render();
      type('[data-testid="clerk-limit"]', '3000');
      const first = page.currentRequestId();
      q<HTMLButtonElement>('[data-testid="undo"]')!.click();
      fixture.detectChanges();

      expect(q<HTMLInputElement>('[data-testid="clerk-limit"]')!.value).toBe('2500');
      expect(page.currentRequestId()).toBeNull();
      type('[data-testid="clerk-limit"]', '3100');
      expect(page.currentRequestId()).not.toBe(first);
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

      expect(q('[data-testid="auto-limit"]')!.getAttribute('aria-invalid')).toBe('true');
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
    it('lists three served rows in the served order with name, roles, old → new and the reason as text', () => {
      service.getPolicy.mockReturnValue(
        of(
          read({}, [
            row({ changedAt: '2026-10-05T15:00:00Z', justification: '<b>Clerks</b> handle routine parts' }),
            row({ changedAt: '2026-10-04T15:00:00Z', setting: 'AP_ALLOW_CREATOR_APPROVAL', oldValue: 'false', newValue: 'true', changedByRoles: ['GENERAL_MANAGER', 'ADMIN'] }),
            row({ changedAt: '2026-10-03T15:00:00Z', setting: 'AP_DEFAULT_TERMS', oldValue: null, newValue: 'NET45' }),
          ]),
        ),
      );
      render();

      const rows = Array.from(host().querySelectorAll('[data-testid="history-row"]'));
      expect(rows.length).toBe(3);
      expect(rows[0].querySelector('[data-testid="history-who"]')?.textContent).toContain('Dana Reyes');
      expect(rows[0].querySelector('[data-testid="history-who"]')?.textContent).toContain('CONTROLLER');
      expect(rows[0].querySelector('[data-testid="history-change"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_CLERK_APPROVAL_LIMIT');
      // Rendered as text, never markup (ADR-0065).
      expect(rows[0].querySelector('[data-testid="history-reason"]')?.textContent).toBe('<b>Clerks</b> handle routine parts');
      expect(rows[0].querySelector('[data-testid="history-reason"] b')).toBeNull();
      expect(rows[1].querySelector('[data-testid="history-who"]')?.textContent).toContain('GENERAL_MANAGER, ADMIN');
      expect(host().querySelector('[data-testid="history-table"] caption')).not.toBeNull();
    });

    it('keeps its own read status: a failed history page shows its Retry while the Bills section stays', () => {
      const page = render();
      service.getPolicy.mockReturnValue(throwError(() => apiError(500, 'INTERNAL')));
      page.retryHistory();
      fixture.detectChanges();

      expect(q('[data-testid="history-error"]')).not.toBeNull();
      expect(q('[data-testid="bills-section"]')).not.toBeNull();
    });
  });
});

describe('classifyPolicyError', () => {
  it.each([
    [apiError(400, 'JUSTIFICATION_REQUIRED'), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.JUSTIFICATION_REQUIRED', ['justification']],
    [apiError(400, 'VALIDATION_ERROR', [{ field: 'clerkApprovalLimit', message: 'x' }]), 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.VALIDATION', ['clerkApprovalLimit']],
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
