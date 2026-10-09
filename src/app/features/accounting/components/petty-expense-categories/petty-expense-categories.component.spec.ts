import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import {
  ExpenseAccountOption,
  PettyExpenseCategory,
  PettyExpenseCategoryCreate,
  PettyExpenseCategoryDeactivate,
  PettyExpenseCategoryRelabel,
  PettyExpenseCategoryRemap,
} from '../../models/petty-expense-categories.models';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { apiError, authMock } from '../../pages/bills/bills-page.spec-helper';
import { classifyCategoryError } from './category-errors';
import { PettyExpenseCategoriesComponent, localDay } from './petty-expense-categories.component';

const VIEW = 'accounting:mapping-key:view';
const CREATE = ['accounting:mapping-key:create', 'accounting:gl-mapping:create'];
const EDIT = 'accounting:mapping-key:edit';
const DEACTIVATE = 'accounting:mapping-key:deactivate';
const REMAP = 'accounting:gl-mapping:create';
const ALL = [VIEW, ...CREATE, EDIT, DEACTIVATE];
const WHY = 'Cashiers asked for this';

const category = (overrides: Partial<PettyExpenseCategory> = {}): PettyExpenseCategory => ({
  code: 'SHOP_SUPPLIES',
  label: 'Shop supplies',
  examples: 'Rags, gloves',
  status: 'ACTIVE',
  currentAccount: { glAccountId: 'gl-6340-uuid', accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
  laterAccount: null,
  version: 2,
  history: [],
  ...overrides,
});

const ACCOUNTS: ExpenseAccountOption[] = [
  { glAccountId: 'gl-6340-uuid', accountCode: '6340', accountName: 'Shop Supplies & Consumables' },
  { glAccountId: 'gl-6375-uuid', accountCode: '6375', accountName: 'Cleaning & Janitorial Supplies' },
];

describe('PettyExpenseCategoriesComponent (§4.6, §5.5, P4, P5)', () => {
  let fixture: ComponentFixture<PettyExpenseCategoriesComponent>;
  let service: {
    create: ReturnType<typeof vi.fn<(command: PettyExpenseCategoryCreate) => Observable<PettyExpenseCategory>>>;
    relabel: ReturnType<typeof vi.fn<(code: string, command: PettyExpenseCategoryRelabel) => Observable<PettyExpenseCategory>>>;
    deactivate: ReturnType<typeof vi.fn<(code: string, command: PettyExpenseCategoryDeactivate) => Observable<PettyExpenseCategory>>>;
    remap: ReturnType<typeof vi.fn<(code: string, command: PettyExpenseCategoryRemap) => Observable<PettyExpenseCategory>>>;
    listExpenseAccounts: ReturnType<typeof vi.fn<() => Observable<ExpenseAccountOption[]>>>;
  };
  let auth: ReturnType<typeof authMock>;
  let tenant: ReturnType<typeof signal<string | null>>;
  let changed: number;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const type = (selector: string, value: string): void => {
    const field = q<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const click = (selector: string): void => {
    q<HTMLElement>(selector)!.click();
    fixture.detectChanges();
  };

  function render(held: readonly string[] | null, rows: PettyExpenseCategory[] = [category()]): PettyExpenseCategoriesComponent {
    tenant = signal<string | null>('tenant-a');
    auth = authMock(held, { tenantId: tenant });
    TestBed.configureTestingModule({
      imports: [PettyExpenseCategoriesComponent, TranslateModule.forRoot()],
      providers: [
        { provide: PettyExpenseCategoriesService, useValue: service },
        { provide: AuthService, useValue: auth.service },
      ],
    });
    fixture = TestBed.createComponent(PettyExpenseCategoriesComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.componentRef.setInput('categories', rows);
    fixture.componentRef.setInput('status', 'OK');
    changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** The page's re-read after `changed`, as the page feeds it back. */
  async function reread(rows: PettyExpenseCategory[]): Promise<void> {
    fixture.componentRef.setInput('status', 'PENDING');
    fixture.detectChanges();
    fixture.componentRef.setInput('categories', rows);
    fixture.componentRef.setInput('status', 'OK');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    service = {
      create: vi.fn(() => of(category())),
      relabel: vi.fn(() => of(category())),
      deactivate: vi.fn(() => of(category({ status: 'INACTIVE' }))),
      remap: vi.fn(() => of(category())),
      listExpenseAccounts: vi.fn(() => of(ACCOUNTS)),
    };
  });

  afterEach(() => (fixture?.nativeElement as HTMLElement | undefined)?.remove());

  describe('gates (AC 7, ADR-0040 §6a)', () => {
    it('without any write permission the table is read-only with the note, no action exists and every method refuses', () => {
      const component = render([VIEW]);

      expect(q('[data-testid="categories-read-only"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.READ_ONLY');
      for (const testid of ['category-add', 'category-rename', 'category-deactivate', 'category-remap']) {
        expect(q(`[data-testid="${testid}"]`)).toBeNull();
      }
      expect(host().querySelectorAll('thead th').length).toBe(4);
      for (const mode of ['CREATE', 'RELABEL', 'DEACTIVATE', 'REMAP'] as const) {
        component.open(mode, category());
        expect(component.dialog()).toBeNull();
      }
      component.submit();
      expect(service.relabel).not.toHaveBeenCalled();
    });

    it('with accounting:mapping-key:edit only, only Rename is offered', () => {
      render([VIEW, EDIT]);

      expect(q('[data-testid="category-rename"]')).not.toBeNull();
      expect(q('[data-testid="category-add"]')).toBeNull();
      expect(q('[data-testid="category-deactivate"]')).toBeNull();
      expect(q('[data-testid="category-remap"]')).toBeNull();
      expect(q('[data-testid="categories-read-only"]')).toBeNull();
    });

    it('Add category needs both codes; Change account needs accounting:gl-mapping:create', () => {
      render([VIEW, 'accounting:mapping-key:create']);
      expect(q('[data-testid="category-add"]')).toBeNull();

      TestBed.resetTestingModule();
      render([VIEW, REMAP]);
      expect(q('[data-testid="category-remap"]')).not.toBeNull();
      expect(q('[data-testid="category-add"]')).toBeNull();
    });

    it('a token without perm_bits follows canAccess and offers every action', () => {
      render(null);

      expect(q('[data-testid="category-add"]')).not.toBeNull();
      expect(q('[data-testid="category-rename"]')).not.toBeNull();
      expect(q('[data-testid="category-deactivate"]')).not.toBeNull();
      expect(q('[data-testid="category-remap"]')).not.toBeNull();
    });

    it('a turned-off category offers no Turn off', () => {
      const component = render(ALL, [category({ status: 'INACTIVE' })]);

      expect(q('[data-testid="category-deactivate"]')).toBeNull();
      component.open('DEACTIVATE', category({ status: 'INACTIVE' }));
      expect(component.dialog()).toBeNull();
    });
  });

  describe('table (AC 8, P8)', () => {
    it('Recorded in shows the served account name and number in mono, never the id; a later account adds "From"', () => {
      render([VIEW], [
        category({ laterAccount: { glAccountId: 'gl-6375-uuid', accountCode: '6375', accountName: 'Cleaning & Janitorial Supplies', effectiveFrom: '2026-11-01' } }),
      ]);

      const cell = q('[data-testid="category-account"]')!;
      expect(cell.textContent).toContain('Shop Supplies & Consumables');
      expect(cell.querySelector('.categories__mono')?.textContent?.trim()).toBe('6340');
      expect(cell.querySelector('[data-testid="category-later-account"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.LATER');
      expect(host().textContent).not.toContain('gl-6340-uuid');
      expect(host().textContent).not.toContain('gl-6375-uuid');
      expect(q('[data-testid="categories-table"] caption')).not.toBeNull();
      expect(Array.from(host().querySelectorAll('thead th')).every(th => th.getAttribute('scope') === 'col')).toBe(true);
      expect(q('[data-testid="category-status"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.STATUS.ON');
    });

    it('shows the never-from-the-drawer list and the tax sentence', () => {
      render([VIEW]);

      const never = q('[data-testid="categories-never"]')!;
      expect(never.classList).toContain('alert-warning');
      expect(never.querySelectorAll('li').length).toBe(6);
      expect(q('[data-testid="categories-tax"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.TAX_INCLUDED');
    });

    it('a failed read shows Retry', () => {
      const component = render([VIEW]);
      let retried = 0;
      component.retry.subscribe(() => retried++);
      fixture.componentRef.setInput('status', 'FAILED');
      fixture.detectChanges();
      click('[data-testid="categories-error"] button');

      expect(retried).toBe(1);
    });
  });

  describe('Rename (AC 9)', () => {
    it('sends the new label, examples, version and reason with a requestId, never the code as a change or an actor', async () => {
      const component = render(ALL);
      click('[data-testid="category-rename"]');
      expect(q('[data-testid="category-code"]')).toBeNull();
      type('[data-testid="category-label"]', 'Shop consumables');
      type('[data-testid="category-examples"]', 'Rags and gloves');
      type('[data-testid="category-reason"]', WHY);
      click('[data-testid="category-confirm"]');

      expect(service.relabel).toHaveBeenCalledTimes(1);
      const [code, body] = service.relabel.mock.calls[0];
      expect(code).toBe('SHOP_SUPPLIES');
      expect(body).toEqual({ label: 'Shop consumables', examples: 'Rags and gloves', version: 2, justification: WHY, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
      expect(Object.keys(body)).not.toContain('code');
      expect(JSON.stringify(body)).not.toMatch(/actor|modifiedBy|createdBy/);
      expect(changed).toBe(1);
      expect(component.dialog()).toBeNull();
      expect(component.currentRequestId()).toBeNull();
      expect(q('[data-testid="categories-announcement"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.RELABEL.DONE');

      await reread([category({ label: 'Shop consumables' })]);
      expect(document.activeElement?.getAttribute('data-testid')).toBe('category-rename');
    });

    it('a VERSION_CONFLICT re-reads and explains in the dialog, keeping the input', () => {
      service.relabel.mockReturnValueOnce(throwError(() => apiError(409, 'VERSION_CONFLICT')));
      const component = render(ALL);
      click('[data-testid="category-rename"]');
      type('[data-testid="category-label"]', 'Shop consumables');
      type('[data-testid="category-reason"]', WHY);
      click('[data-testid="category-confirm"]');

      expect(changed).toBe(1);
      expect(component.dialog()).not.toBeNull();
      expect(q('[data-testid="category-dialog-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.VERSION_CONFLICT');
      expect(q<HTMLInputElement>('[data-testid="category-label"]')!.value).toBe('Shop consumables');
    });
  });

  describe('Turn off (AC 9)', () => {
    it('states the consequence before the confirm, sends the reason and a requestId, and focus falls back to the heading once the control is gone', async () => {
      render(ALL);
      click('[data-testid="category-deactivate"]');
      const consequence = q('[data-testid="category-consequence"]')!;
      const confirm = q('[data-testid="category-confirm"]')!;
      expect(consequence.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.DEACTIVATE.CONSEQUENCE');
      expect(consequence.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(q<HTMLButtonElement>('[data-testid="category-confirm"]')!.disabled).toBe(true);
      type('[data-testid="category-reason"]', WHY);
      click('[data-testid="category-confirm"]');

      expect(service.deactivate).toHaveBeenCalledWith('SHOP_SUPPLIES', { justification: WHY, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
      expect(changed).toBe(1);

      await reread([category({ status: 'INACTIVE' })]);
      expect(q('[data-testid="category-status"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.STATUS.OFF');
      expect(q('[data-testid="category-deactivate"]')).toBeNull();
      expect(document.activeElement?.id).toBe('approval-limits-categories');
    });

    it('an already-inactive refusal re-reads and explains', () => {
      service.deactivate.mockReturnValueOnce(throwError(() => apiError(409, 'PETTY_EXPENSE_CATEGORY_INACTIVE')));
      render(ALL);
      click('[data-testid="category-deactivate"]');
      type('[data-testid="category-reason"]', WHY);
      click('[data-testid="category-confirm"]');

      expect(changed).toBe(1);
      expect(q('[data-testid="category-dialog-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.INACTIVE');
    });
  });

  describe('Change account (AC 10)', () => {
    function openRemap(): void {
      click('[data-testid="category-remap"]');
      type('[data-testid="category-account-picker"]', 'gl-6375-uuid');
      type('[data-testid="category-reason"]', WHY);
    }

    it('sends the chosen active account, the local Starting on date, the reason and a requestId', () => {
      const component = render(ALL);
      openRemap();

      expect(q<HTMLInputElement>('[data-testid="category-from"]')!.value).toBe(localDay(new Date()));
      expect(q('[data-testid="category-consequence"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.REMAP.CONSEQUENCE');
      const requestId = component.currentRequestId();
      click('[data-testid="category-confirm"]');

      expect(service.listExpenseAccounts).toHaveBeenCalledTimes(1);
      expect(service.remap).toHaveBeenCalledWith('SHOP_SUPPLIES', {
        glAccountId: 'gl-6375-uuid',
        effectiveFrom: localDay(new Date()),
        justification: WHY,
        requestId,
      });
    });

    it('shows a 400 for overlapping dates in the dialog, on the date field', () => {
      service.remap.mockReturnValueOnce(throwError(() => apiError(400, 'PETTY_EXPENSE_MAPPING_OVERLAP')));
      render(ALL);
      openRemap();
      click('[data-testid="category-confirm"]');

      expect(q('[data-testid="category-dialog-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.OVERLAP');
      const from = q('[data-testid="category-from"]')!;
      expect(from.getAttribute('aria-invalid')).toBe('true');
      expect(from.getAttribute('aria-describedby')).toContain('category-dialog-error');
      expect(changed).toBe(0);
    });

    it('marks the account field on 422 PETTY_EXPENSE_ACCOUNT_NOT_ELIGIBLE and keeps the choice', () => {
      service.remap.mockReturnValueOnce(throwError(() => apiError(422, 'PETTY_EXPENSE_ACCOUNT_NOT_ELIGIBLE')));
      render(ALL);
      openRemap();
      click('[data-testid="category-confirm"]');

      const picker = q<HTMLSelectElement>('[data-testid="category-account-picker"]')!;
      expect(picker.getAttribute('aria-invalid')).toBe('true');
      expect(picker.getAttribute('aria-describedby')).toContain('category-dialog-error');
      expect(picker.value).toBe('gl-6375-uuid');
    });

    it('when accounts cannot be loaded the dialog says so and its submit stays disabled', () => {
      service.listExpenseAccounts.mockReturnValueOnce(throwError(() => apiError(403, 'FORBIDDEN')));
      render(ALL);
      click('[data-testid="category-remap"]');
      type('[data-testid="category-reason"]', WHY);

      expect(q('[data-testid="category-accounts-failed"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.FIELD.ACCOUNTS_FAILED');
      expect(q<HTMLSelectElement>('[data-testid="category-account-picker"]')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('[data-testid="category-confirm"]')!.disabled).toBe(true);
    });
  });

  describe('Add category (AC 10, §8.2)', () => {
    function fillCreate(): void {
      click('[data-testid="category-add"]');
      type('[data-testid="category-code"]', 'STAFF_MEALS');
      type('[data-testid="category-label"]', 'Staff meals');
      type('[data-testid="category-examples"]', 'Lunch for the crew');
      type('[data-testid="category-account-picker"]', 'gl-6340-uuid');
      type('[data-testid="category-reason"]', WHY);
    }

    it('sends one create with code, label, examples, account, reason and requestId; a retry reuses the requestId', () => {
      service.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 504 })));
      const component = render(ALL);
      fillCreate();
      expect(q('[data-testid="category-consequence"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.CREATE.CONSEQUENCE');
      click('[data-testid="category-confirm"]');

      expect(service.create).toHaveBeenCalledTimes(1);
      const first = service.create.mock.calls[0][0];
      expect(first).toEqual({
        code: 'STAFF_MEALS',
        label: 'Staff meals',
        examples: 'Lunch for the crew',
        glAccountId: 'gl-6340-uuid',
        justification: WHY,
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      expect(q('[data-testid="category-dialog-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.UNKNOWN_OUTCOME');
      expect(component.currentRequestId()).toBe(first.requestId);

      click('[data-testid="category-confirm"]');
      expect(service.create.mock.calls[1][0].requestId).toBe(first.requestId);
      expect(changed).toBe(1);
    });

    it('an edited payload after an unknown outcome gets a new requestId', () => {
      service.create.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      render(ALL);
      fillCreate();
      click('[data-testid="category-confirm"]');
      const first = service.create.mock.calls[0][0].requestId;
      type('[data-testid="category-label"]', 'Staff lunches');
      click('[data-testid="category-confirm"]');

      expect(service.create.mock.calls[1][0].requestId).not.toBe(first);
    });

    it('marks the code field on 409 PETTY_EXPENSE_CATEGORY_EXISTS and keeps the input', () => {
      service.create.mockReturnValueOnce(throwError(() => apiError(409, 'PETTY_EXPENSE_CATEGORY_EXISTS')));
      render(ALL);
      fillCreate();
      click('[data-testid="category-confirm"]');

      const code = q<HTMLInputElement>('[data-testid="category-code"]')!;
      expect(code.getAttribute('aria-invalid')).toBe('true');
      expect(code.getAttribute('aria-describedby')).toContain('category-dialog-error');
      expect(code.value).toBe('STAFF_MEALS');
    });

    it('refuses a code that is not capital letters, digits and underscores', () => {
      render(ALL);
      fillCreate();
      type('[data-testid="category-code"]', 'staff meals');

      expect(q('[data-testid="category-code"]')!.getAttribute('aria-invalid')).toBe('true');
      expect(q<HTMLButtonElement>('[data-testid="category-confirm"]')!.disabled).toBe(true);
    });

    it('the key rotates on close', () => {
      const component = render(ALL);
      click('[data-testid="category-add"]');
      const opened = component.currentRequestId();
      click('[data-testid="category-cancel"]');
      expect(component.currentRequestId()).toBeNull();
      click('[data-testid="category-add"]');
      expect(component.currentRequestId()).not.toBe(opened);
    });
  });

  describe('ordering and identity (ADR-0063)', () => {
    it('a write that lands after the person changed tenant is dropped and the dialog is closed', () => {
      const pending = new Subject<PettyExpenseCategory>();
      service.relabel.mockReturnValueOnce(pending);
      const component = render(ALL);
      click('[data-testid="category-rename"]');
      type('[data-testid="category-reason"]', WHY);
      click('[data-testid="category-confirm"]');
      expect(component.busy()).toBe(true);

      tenant.set('tenant-b');
      const claims: JwtClaims = { sub: 'someone-else', exp: 0 };
      auth.claims.set(claims);
      fixture.detectChanges();
      pending.next(category());
      fixture.detectChanges();

      expect(component.dialog()).toBeNull();
      expect(changed).toBe(0);
      expect(q('[data-testid="categories-announcement"]')?.textContent?.trim()).toBe('');
    });
  });
});

describe('classifyCategoryError', () => {
  it.each([
    [apiError(400, 'VALIDATION_ERROR', [{ field: 'justification', message: 'x' }]), 'VALIDATION', 'justification', false],
    [apiError(409, 'PETTY_EXPENSE_CATEGORY_EXISTS'), 'EXISTS', 'code', false],
    [apiError(422, 'PETTY_EXPENSE_CATEGORY_NOT_ALLOWED'), 'NOT_ALLOWED', 'code', false],
    [apiError(422, 'PETTY_EXPENSE_ACCOUNT_NOT_ELIGIBLE'), 'ACCOUNT_NOT_ELIGIBLE', 'glAccountId', false],
    [apiError(422, 'PETTY_EXPENSE_ACCOUNT_CHANGE_BACKDATED'), 'BACKDATED', 'effectiveFrom', false],
    [apiError(400, 'PETTY_EXPENSE_MAPPING_OVERLAP'), 'OVERLAP', 'effectiveFrom', false],
    [apiError(404, 'PETTY_EXPENSE_CATEGORY_NOT_FOUND'), 'NOT_FOUND', null, true],
    [apiError(409, 'VERSION_CONFLICT'), 'VERSION_CONFLICT', null, true],
    [apiError(409, 'PETTY_EXPENSE_CATEGORY_INACTIVE'), 'INACTIVE', null, true],
    [new HttpErrorResponse({ status: 503 }), 'UNKNOWN_OUTCOME', null, false],
    [apiError(422, 'SOMETHING_NEW'), 'OTHER', null, false],
  ])('classifies %#', (error, key, field, reread) => {
    const failure = classifyCategoryError(error, EDIT);
    expect(failure.key).toBe(`ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.${key}`);
    expect(failure.field).toBe(field);
    expect(failure.reread).toBe(reread);
  });

  it('rotates the key on IDEMPOTENCY_CONFLICT and names the write permission on 403', () => {
    expect(classifyCategoryError(apiError(409, 'IDEMPOTENCY_CONFLICT'), EDIT).rotate).toBe(true);
    expect(classifyCategoryError(apiError(403, 'FORBIDDEN'), EDIT).params).toEqual({ permission: EDIT });
  });
});
