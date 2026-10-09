import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterSessionsService, SessionPolicyResponse, TypePolicyTypeEnum } from '@durion-sdk/order';
import { DrawerPolicyRead } from '../models/drawer-policy.models';
import { DrawerPolicyService } from './drawer-policy.service';

/** A complete SDK response, typed against the generated interface (ADR-0032). */
const response = (overrides: Partial<SessionPolicyResponse> = {}): SessionPolicyResponse => ({
  version: 3,
  currencyCode: 'USD',
  overShortTolerance: 5,
  types: [
    { type: TypePolicyTypeEnum.PettyExpense, allowed: true, cashierLimit: 50, alwaysNeedsManager: false, editable: true },
    { type: TypePolicyTypeEnum.VendorCod, allowed: false, alwaysNeedsManager: false, editable: true },
    { type: TypePolicyTypeEnum.BankDrop, allowed: true, alwaysNeedsManager: false, editable: false },
    { type: TypePolicyTypeEnum.FloatChange, allowed: true, alwaysNeedsManager: true, editable: false },
    { type: 'TIP_OUT' as TypePolicyTypeEnum, allowed: true, alwaysNeedsManager: false, editable: true },
  ],
  history: [
    {
      setting: 'PETTY_EXPENSE_LIMIT',
      oldValue: '40.00',
      newValue: '50.00',
      actor: 'controller.cfo',
      justification: 'Supplies cost more now',
      changedAt: '2026-10-05T15:00:00Z',
    },
    { setting: 'SOMETHING_NEW', newValue: 'x', actor: 'controller.cfo', justification: 'A later setting', changedAt: '2026-10-04T15:00:00Z' },
  ],
  ...overrides,
});

const expected: DrawerPolicyRead = {
  policy: {
    version: 3,
    currencyCode: 'USD',
    overShortTolerance: 5,
    types: [
      { type: 'PETTY_EXPENSE', allowed: true, cashierLimit: 50, alwaysNeedsManager: false, editable: true },
      { type: 'VENDOR_COD', allowed: false, cashierLimit: null, alwaysNeedsManager: false, editable: true },
      { type: 'BANK_DROP', allowed: true, cashierLimit: null, alwaysNeedsManager: false, editable: false },
      { type: 'FLOAT_CHANGE', allowed: true, cashierLimit: null, alwaysNeedsManager: true, editable: false },
      { type: 'UNKNOWN', allowed: true, cashierLimit: null, alwaysNeedsManager: false, editable: false },
    ],
  },
  history: [
    { changedAt: '2026-10-05T15:00:00Z', setting: 'PETTY_EXPENSE_LIMIT', oldValue: '40.00', newValue: '50.00', justification: 'Supplies cost more now' },
    { changedAt: '2026-10-04T15:00:00Z', setting: 'UNKNOWN', oldValue: null, newValue: 'x', justification: 'A later setting' },
  ],
};

describe('DrawerPolicyService', () => {
  let service: DrawerPolicyService;
  const sdk = { getSessionPolicy: vi.fn(), updateSessionPolicy: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DrawerPolicyService, { provide: RegisterSessionsService, useValue: sdk }] });
    service = TestBed.inject(DrawerPolicyService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getPolicy()', () => {
    it('calls getSessionPolicy() with no arguments and maps the types in served order, an unknown type read-only', async () => {
      sdk.getSessionPolicy.mockReturnValue(of(response()));

      const read = await firstValueFrom(service.getPolicy());

      expect(sdk.getSessionPolicy).toHaveBeenCalledWith();
      expect(read).toEqual(expected);
      // The username is never kept (Q4 on #464).
      expect(JSON.stringify(read)).not.toContain('controller.cfo');
    });

    it('maps the defaults (no stored version) to a null version', async () => {
      sdk.getSessionPolicy.mockReturnValue(of(response({ version: undefined })));

      const read = await firstValueFrom(service.getPolicy());

      expect(read.policy.version).toBeNull();
    });
  });

  describe('updatePolicy()', () => {
    it('calls updateSessionPolicy with the full replacement, the version read and the reason, and no actor', async () => {
      sdk.updateSessionPolicy.mockReturnValue(of(response({ version: 4 })));

      const read = await firstValueFrom(
        service.updatePolicy({
          version: 3,
          currencyCode: 'USD',
          pettyExpense: { allowed: true, cashierLimit: 75 },
          vendorCod: { allowed: false, cashierLimit: null },
          overShortTolerance: 3,
          justification: 'Tighter count after the audit',
        }),
      );

      expect(sdk.updateSessionPolicy).toHaveBeenCalledWith({
        version: 3,
        currencyCode: 'USD',
        pettyExpense: { allowed: true, cashierLimit: 75 },
        vendorCod: { allowed: false },
        overShortTolerance: 3,
        justification: 'Tighter count after the audit',
      });
      expect(read.policy.version).toBe(4);
    });

    it('omits the version while the defaults apply', async () => {
      sdk.updateSessionPolicy.mockReturnValue(of(response({ version: 0 })));

      await firstValueFrom(
        service.updatePolicy({
          version: null,
          currencyCode: 'USD',
          pettyExpense: { allowed: false, cashierLimit: 50 },
          vendorCod: { allowed: true, cashierLimit: 200 },
          overShortTolerance: 5,
          justification: 'Vendors deliver on Saturdays',
        }),
      );

      expect(sdk.updateSessionPolicy.mock.calls[0]).toEqual([
        {
          currencyCode: 'USD',
          pettyExpense: { allowed: false, cashierLimit: 50 },
          vendorCod: { allowed: true, cashierLimit: 200 },
          overShortTolerance: 5,
          justification: 'Vendors deliver on Saturdays',
        },
      ]);
    });
  });
});
