import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APApprovalPolicyService, ApApprovalPolicyResponse } from '@durion-sdk/accounting';
import { POLICY_HISTORY_PAGE_SIZE } from '../models/ap-approval-policy.models';
import { ApApprovalPolicyService } from './ap-approval-policy.service';

/** A complete SDK response, typed against the generated interface (ADR-0032). */
const response = (overrides: Partial<ApApprovalPolicyResponse> = {}): ApApprovalPolicyResponse => ({
  clerkApprovalLimit: 2500,
  autoApprovalLimit: 500,
  currencyCode: 'USD',
  allowCreatorApproval: false,
  allowApproverPayment: true,
  defaultTerms: 'NET30',
  asOf: '2026-10-06T10:00:00Z',
  history: [
    {
      changedAt: '2026-10-05T15:00:00Z',
      changedBy: 'Dana Reyes',
      changedByRoles: ['CONTROLLER'],
      setting: 'AP_CLERK_APPROVAL_LIMIT',
      oldValue: '1000.00',
      newValue: '2500.00',
      justification: 'Clerks handle routine parts orders',
    },
    {
      changedAt: '2026-10-04T15:00:00Z',
      changedBy: 'Dana Reyes',
      changedByRoles: ['CONTROLLER'],
      setting: 'AP_SOMETHING_NEW',
      newValue: 'x',
      justification: 'A later setting',
    },
  ],
  historyPage: 0,
  historySize: 20,
  historyTotal: 2,
  ...overrides,
});

describe('ApApprovalPolicyService', () => {
  let service: ApApprovalPolicyService;
  const sdk = { getApApprovalPolicy: vi.fn(), setApApprovalPolicy: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ApApprovalPolicyService, { provide: APApprovalPolicyService, useValue: sdk }] });
    service = TestBed.inject(ApApprovalPolicyService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getPolicy()', () => {
    it('calls getApApprovalPolicy(historyPage, historySize) and splits the policy from its history', async () => {
      sdk.getApApprovalPolicy.mockReturnValue(of(response()));

      const read = await firstValueFrom(service.getPolicy(2));

      expect(sdk.getApApprovalPolicy).toHaveBeenCalledWith(2, POLICY_HISTORY_PAGE_SIZE);
      expect(read.policy).toEqual({
        clerkApprovalLimit: 2500,
        autoApprovalLimit: 500,
        currencyCode: 'USD',
        allowCreatorApproval: false,
        allowApproverPayment: true,
        defaultTerms: 'NET30',
        asOf: '2026-10-06T10:00:00Z',
      });
      expect(read.history.rows[0]).toEqual({
        changedAt: '2026-10-05T15:00:00Z',
        changedBy: 'Dana Reyes',
        changedByRoles: ['CONTROLLER'],
        setting: 'AP_CLERK_APPROVAL_LIMIT',
        oldValue: '1000.00',
        newValue: '2500.00',
        justification: 'Clerks handle routine parts orders',
      });
      expect(read.history.rows[1].setting).toBe('UNKNOWN');
      expect(read.history.rows[1].oldValue).toBeNull();
      expect(read.history).toMatchObject({ page: 0, size: 20, total: 2 });
    });
  });

  describe('updatePolicy()', () => {
    it('calls setApApprovalPolicy with the Bills keys, currency, reason and requestId only', async () => {
      sdk.setApApprovalPolicy.mockReturnValue(of(response({ clerkApprovalLimit: 3000 })));

      const read = await firstValueFrom(
        service.updatePolicy({
          clerkApprovalLimit: 3000,
          autoApprovalLimit: 500,
          currencyCode: 'USD',
          justification: 'Busier season, more parts',
          requestId: '018f2a6e-0000-7000-8000-000000000001',
        }),
      );

      expect(sdk.setApApprovalPolicy).toHaveBeenCalledWith({
        clerkApprovalLimit: 3000,
        autoApprovalLimit: 500,
        currencyCode: 'USD',
        justification: 'Busier season, more parts',
        requestId: '018f2a6e-0000-7000-8000-000000000001',
      });
      expect(read.policy.clerkApprovalLimit).toBe(3000);
    });
  });
});
