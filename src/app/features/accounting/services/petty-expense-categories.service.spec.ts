import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountingInputTaxRecoveryService,
  AccountingPettyExpenseCategoriesService,
  GLAccountListResponse,
  GLAccountResponse,
  GLAccountResponseAccountTypeEnum,
  GLAccountResponseStatusEnum,
  GLAccountsService,
  InputTaxRecoveryResponse,
  PettyExpenseCategoryHistoryItemChangeTypeEnum,
  PettyExpenseCategoryListResponse,
  PettyExpenseCategoryResponse,
  PettyExpenseCategoryResponseStatusEnum,
  PettyExpenseCategoryTaxRecoveryResponse,
} from '@durion-sdk/accounting';
import { InputTaxRecovery } from '../models/input-tax-recovery.models';
import { PettyExpenseCategory } from '../models/petty-expense-categories.models';
import { PettyExpenseCategoriesService } from './petty-expense-categories.service';

const REQUEST_ID = '018f2a6e-0000-7000-8000-000000000001';

/** Typed against the generated interfaces (ADR-0032). */
const served = (overrides: Partial<PettyExpenseCategoryResponse> = {}): PettyExpenseCategoryResponse => ({
  code: 'SHOP_SUPPLIES',
  label: 'Shop supplies',
  examples: 'Rags, gloves, valve caps',
  status: PettyExpenseCategoryResponseStatusEnum.Active,
  version: 2,
  currentAccount: { glAccountId: 'gl-6340', accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
  laterAccount: { glAccountId: 'gl-6375', accountCode: '6375', accountName: 'Cleaning & Janitorial Supplies', effectiveFrom: '2026-11-01' },
  history: [
    {
      changeType: PettyExpenseCategoryHistoryItemChangeTypeEnum.Create,
      newValue: 'Shop supplies posting to 6340 from 2026-01-01',
      actor: 'controller.cfo',
      justification: 'Seeded at go-live',
      changedAt: '2026-01-01T09:00:00Z',
    },
    { changeType: 'RENAMED_LATER' as PettyExpenseCategoryHistoryItemChangeTypeEnum, actor: 'controller.cfo', justification: 'A later change', changedAt: '2026-02-01T09:00:00Z' },
  ],
  ...overrides,
});

const mapped: PettyExpenseCategory = {
  code: 'SHOP_SUPPLIES',
  label: 'Shop supplies',
  examples: 'Rags, gloves, valve caps',
  status: 'ACTIVE',
  version: 2,
  currentAccount: { glAccountId: 'gl-6340', accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
  laterAccount: { glAccountId: 'gl-6375', accountCode: '6375', accountName: 'Cleaning & Janitorial Supplies', effectiveFrom: '2026-11-01' },
  history: [
    { changedAt: '2026-01-01T09:00:00Z', changeType: 'CREATE', oldValue: null, newValue: 'Shop supplies posting to 6340 from 2026-01-01', justification: 'Seeded at go-live' },
    { changedAt: '2026-02-01T09:00:00Z', changeType: 'UNKNOWN', oldValue: null, newValue: null, justification: 'A later change' },
  ],
};

const account = (overrides: Partial<GLAccountResponse> = {}): GLAccountResponse => ({
  glAccountId: 'gl-6340',
  accountCode: '6340',
  accountName: 'Shop Supplies & Consumables',
  accountType: GLAccountResponseAccountTypeEnum.Expense,
  status: GLAccountResponseStatusEnum.Active,
  reconcilable: false,
  ...overrides,
});

const accountPage = (glAccounts: GLAccountResponse[], totalPages = 1, pageNumber = 0): GLAccountListResponse => ({
  glAccounts,
  pageNumber,
  pageSize: 200,
  totalElements: glAccounts.length,
  totalPages,
});

describe('PettyExpenseCategoriesService', () => {
  let service: PettyExpenseCategoriesService;
  const sdk = {
    listPettyExpenseCategories: vi.fn(),
    createPettyExpenseCategory: vi.fn(),
    updatePettyExpenseCategory: vi.fn(),
    deactivatePettyExpenseCategory: vi.fn(),
    remapPettyExpenseCategory: vi.fn(),
    setPettyExpenseCategoryTaxRecovery: vi.fn(),
  };
  const accountsSdk = { listGLAccounts: vi.fn() };
  const recoverySdk = { getInputTaxRecovery: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PettyExpenseCategoriesService,
        { provide: AccountingPettyExpenseCategoriesService, useValue: sdk },
        { provide: GLAccountsService, useValue: accountsSdk },
        { provide: AccountingInputTaxRecoveryService, useValue: recoverySdk },
      ],
    });
    service = TestBed.inject(PettyExpenseCategoriesService);
  });

  afterEach(() => vi.clearAllMocks());

  it('list() calls listPettyExpenseCategories() and maps accounts and history, never keeping the username', async () => {
    const view: PettyExpenseCategoryListResponse = { categories: [served()] };
    sdk.listPettyExpenseCategories.mockReturnValue(of(view));

    const categories = await firstValueFrom(service.list());

    expect(sdk.listPettyExpenseCategories).toHaveBeenCalledWith();
    expect(categories).toEqual([mapped]);
    expect(JSON.stringify(categories)).not.toContain('controller.cfo');
  });

  it('create() sends one createPettyExpenseCategory with code, label, examples, account, reason and requestId', async () => {
    sdk.createPettyExpenseCategory.mockReturnValue(of(served()));

    const created = await firstValueFrom(
      service.create({
        code: 'SHOP_SUPPLIES',
        label: 'Shop supplies',
        examples: 'Rags, gloves, valve caps',
        glAccountId: 'gl-6340',
        justification: 'Cashiers buy these weekly',
        requestId: REQUEST_ID,
      }),
    );

    expect(sdk.createPettyExpenseCategory).toHaveBeenCalledWith({
      code: 'SHOP_SUPPLIES',
      label: 'Shop supplies',
      examples: 'Rags, gloves, valve caps',
      glAccountId: 'gl-6340',
      justification: 'Cashiers buy these weekly',
      requestId: REQUEST_ID,
    });
    expect(created).toEqual(mapped);
  });

  it('create() omits empty examples', async () => {
    sdk.createPettyExpenseCategory.mockReturnValue(of(served()));

    await firstValueFrom(
      service.create({ code: 'STAFF_MEALS', label: 'Staff meals', examples: null, glAccountId: 'gl-6295', justification: 'Lunch for the crew', requestId: REQUEST_ID }),
    );

    expect(sdk.createPettyExpenseCategory.mock.calls[0]).toEqual([
      { code: 'STAFF_MEALS', label: 'Staff meals', glAccountId: 'gl-6295', justification: 'Lunch for the crew', requestId: REQUEST_ID },
    ]);
  });

  it('relabel(code, …) calls updatePettyExpenseCategory(code, body) with label, examples, version, reason and requestId only', async () => {
    sdk.updatePettyExpenseCategory.mockReturnValue(of(served({ label: 'Shop consumables', version: 3 })));

    const renamed = await firstValueFrom(
      service.relabel('SHOP_SUPPLIES', {
        label: 'Shop consumables',
        examples: 'Rags and gloves',
        version: 2,
        justification: 'Clearer for cashiers',
        requestId: REQUEST_ID,
      }),
    );

    expect(sdk.updatePettyExpenseCategory).toHaveBeenCalledWith('SHOP_SUPPLIES', {
      label: 'Shop consumables',
      examples: 'Rags and gloves',
      version: 2,
      justification: 'Clearer for cashiers',
      requestId: REQUEST_ID,
    });
    expect(renamed.label).toBe('Shop consumables');
  });

  it('relabel() omits a null version and null examples', async () => {
    sdk.updatePettyExpenseCategory.mockReturnValue(of(served()));

    await firstValueFrom(
      service.relabel('SHOP_SUPPLIES', { label: 'Shop supplies', examples: null, version: null, justification: 'Clearer for cashiers', requestId: REQUEST_ID }),
    );

    expect(sdk.updatePettyExpenseCategory.mock.calls[0]).toEqual([
      'SHOP_SUPPLIES',
      { label: 'Shop supplies', justification: 'Clearer for cashiers', requestId: REQUEST_ID },
    ]);
  });

  it('deactivate(code, …) calls deactivatePettyExpenseCategory(code, {justification, requestId})', async () => {
    sdk.deactivatePettyExpenseCategory.mockReturnValue(of(served({ status: PettyExpenseCategoryResponseStatusEnum.Inactive })));

    const off = await firstValueFrom(service.deactivate('SHOP_SUPPLIES', { justification: 'Nobody buys these', requestId: REQUEST_ID }));

    expect(sdk.deactivatePettyExpenseCategory).toHaveBeenCalledWith('SHOP_SUPPLIES', { justification: 'Nobody buys these', requestId: REQUEST_ID });
    expect(off.status).toBe('INACTIVE');
  });

  it('remap(code, …) calls remapPettyExpenseCategory(code, {glAccountId, effectiveFrom, justification, requestId})', async () => {
    sdk.remapPettyExpenseCategory.mockReturnValue(of(served()));

    await firstValueFrom(
      service.remap('SHOP_SUPPLIES', { glAccountId: 'gl-6375', effectiveFrom: '2026-11-01', justification: 'New chart from November', requestId: REQUEST_ID }),
    );

    expect(sdk.remapPettyExpenseCategory).toHaveBeenCalledWith('SHOP_SUPPLIES', {
      glAccountId: 'gl-6375',
      effectiveFrom: '2026-11-01',
      justification: 'New chart from November',
      requestId: REQUEST_ID,
    });
  });

  describe('listExpenseAccounts()', () => {
    it('reads active accounts by number and keeps only served expense accounts', async () => {
      accountsSdk.listGLAccounts.mockReturnValue(
        of(accountPage([account(), account({ glAccountId: 'gl-1095', accountCode: '1095', accountType: GLAccountResponseAccountTypeEnum.Asset })])),
      );

      const options = await firstValueFrom(service.listExpenseAccounts());

      expect(accountsSdk.listGLAccounts).toHaveBeenCalledWith('accountCode,asc', 0, 200, 'ACTIVE');
      expect(options).toEqual([{ glAccountId: 'gl-6340', accountCode: '6340', accountName: 'Shop Supplies & Consumables' }]);
    });

    it('reads every further page, bounded', async () => {
      accountsSdk.listGLAccounts.mockImplementation((_sort: string, page: number) =>
        of(accountPage([account({ glAccountId: `gl-${page}`, accountCode: `63${page}0` })], 2, page)),
      );

      const options = await firstValueFrom(service.listExpenseAccounts());

      expect(accountsSdk.listGLAccounts).toHaveBeenCalledTimes(2);
      expect(accountsSdk.listGLAccounts).toHaveBeenLastCalledWith('accountCode,asc', 1, 200, 'ACTIVE');
      expect(options.map(option => option.glAccountId)).toEqual(['gl-0', 'gl-1']);
    });
  });
  describe('input-tax recovery (S33)', () => {
    /** Placeholder codes only: the client names no country, regime or tax type (owner direction). */
    const view: InputTaxRecoveryResponse = {
      asOf: '2026-10-09T12:00:00Z',
      regimes: [
        {
          countryCode: 'ZZ',
          regime: 'ZZ_FED',
          enabled: true,
          registration: { number: '123456789RT0001', since: '2026-01-01' },
          account: { code: '1250', name: 'Tax Recoverable' },
        },
        { countryCode: 'ZZ', regime: 'ZZ_REG', enabled: null, registration: { number: '1234567890TQ0001', since: '2026-03-01' }, account: { code: '1260', name: 'Regional Tax Recoverable' } },
      ],
      evidenceRules: [{ countryCode: 'ZZ', currencyCode: 'ZZD', rules: [{ appliesTo: ['DRAWER_RECEIPT', 'VENDOR_BILL'], rule: 'SUPPLIER_REGISTRATION', threshold: 100.0 }] }],
      categories: [
        { code: 'STAFF_MEALS', label: 'Staff meals', taxRecoverable: true, recoverablePercent: 50, version: 3 },
        { code: 'POSTAGE', label: 'Postage', taxRecoverable: false, recoverablePercent: null, version: 0 },
      ],
      history: [
        {
          code: 'STAFF_MEALS',
          actor: 'controller.cfo',
          actorRole: 'CONTROLLER',
          effectiveFrom: '2026-10-01T10:00:00Z',
          oldTaxRecoverable: null,
          newTaxRecoverable: true,
          newRecoverablePercent: 50,
          reason: 'Meals are half deductible',
        },
      ],
    };

    it('recovery() calls getInputTaxRecovery() and maps regimes, evidence, shares and history, never keeping the username', async () => {
      recoverySdk.getInputTaxRecovery.mockReturnValue(of(view));

      const read = await firstValueFrom(service.recovery());

      expect(recoverySdk.getInputTaxRecovery).toHaveBeenCalledWith();
      const expected: InputTaxRecovery = {
        asOf: '2026-10-09T12:00:00Z',
        regimes: [
          {
            countryCode: 'ZZ',
            regime: 'ZZ_FED',
            enabled: true,
            registrationNumber: '123456789RT0001',
            since: '2026-01-01',
            accountName: 'Tax Recoverable',
            accountCode: '1250',
          },
          {
            countryCode: 'ZZ',
            regime: 'ZZ_REG',
            enabled: null,
            registrationNumber: '1234567890TQ0001',
            since: '2026-03-01',
            accountName: 'Regional Tax Recoverable',
            accountCode: '1260',
          },
        ],
        evidence: [{ countryCode: 'ZZ', currencyCode: 'ZZD', rules: [{ appliesTo: ['DRAWER_RECEIPT', 'VENDOR_BILL'], rule: 'SUPPLIER_REGISTRATION', threshold: 100 }] }],
        categories: [
          { code: 'STAFF_MEALS', label: 'Staff meals', taxRecoverable: true, recoverablePercent: 50, version: 3 },
          { code: 'POSTAGE', label: 'Postage', taxRecoverable: false, recoverablePercent: null, version: 0 },
        ],
        history: [
          {
            code: 'STAFF_MEALS',
            effectiveFrom: '2026-10-01T10:00:00Z',
            actorRole: 'CONTROLLER',
            oldTaxRecoverable: null,
            oldRecoverablePercent: null,
            newTaxRecoverable: true,
            newRecoverablePercent: 50,
            reason: 'Meals are half deductible',
          },
        ],
      };
      expect(read).toEqual(expected);
      expect(JSON.stringify(read)).not.toContain('controller.cfo');
    });

    it('recovery() keeps evidence null when the tax service did not answer, and reads absent lists as empty', async () => {
      recoverySdk.getInputTaxRecovery.mockReturnValue(of({ asOf: '2026-10-09T12:00:00Z' } satisfies InputTaxRecoveryResponse));

      const read = await firstValueFrom(service.recovery());

      expect(read).toEqual({ asOf: '2026-10-09T12:00:00Z', regimes: [], evidence: null, categories: [], history: [] });
    });

    it('setTaxShare() sends taxRecoverable, the share, version, reason and requestId, and maps the answer', async () => {
      const answer: PettyExpenseCategoryTaxRecoveryResponse = {
        code: 'STAFF_MEALS',
        effectiveFrom: '2026-10-09T12:00:00Z',
        taxRecoverable: true,
        recoverablePercent: 100,
        version: 4,
        replayed: false,
      };
      sdk.setPettyExpenseCategoryTaxRecovery.mockReturnValue(of(answer));

      const result = await firstValueFrom(
        service.setTaxShare('STAFF_MEALS', { taxRecoverable: true, recoverablePercent: 100, version: 3, justification: 'All of it is claimable', requestId: REQUEST_ID }),
      );

      expect(sdk.setPettyExpenseCategoryTaxRecovery).toHaveBeenCalledWith('STAFF_MEALS', {
        taxRecoverable: true,
        recoverablePercent: 100,
        version: 3,
        justification: 'All of it is claimable',
        requestId: REQUEST_ID,
      });
      expect(result).toEqual({ code: 'STAFF_MEALS', taxRecoverable: true, recoverablePercent: 100, version: 4, replayed: false });
    });

    it('setTaxShare() leaves the share out when the category claims nothing back', async () => {
      sdk.setPettyExpenseCategoryTaxRecovery.mockReturnValue(
        of({ code: 'POSTAGE', effectiveFrom: '2026-10-09T12:00:00Z', taxRecoverable: false, recoverablePercent: null, version: 1, replayed: true }),
      );

      const result = await firstValueFrom(
        service.setTaxShare('POSTAGE', { taxRecoverable: false, recoverablePercent: 50, version: 0, justification: 'Postage carries no tax', requestId: REQUEST_ID }),
      );

      expect(sdk.setPettyExpenseCategoryTaxRecovery).toHaveBeenCalledWith('POSTAGE', {
        taxRecoverable: false,
        version: 0,
        justification: 'Postage carries no tax',
        requestId: REQUEST_ID,
      });
      expect(result.replayed).toBe(true);
    });
  });
});
