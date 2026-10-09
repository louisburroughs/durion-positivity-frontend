import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  APApprovalPolicyService as ApApprovalPolicySdk,
  ApApprovalPolicyHistoryRow,
  ApApprovalPolicyResponse,
} from '@durion-sdk/accounting';
import {
  ApPolicyBillsUpdate,
  ApPolicyHistoryRow,
  ApPolicyRead,
  ApPolicySetting,
  POLICY_HISTORY_PAGE_SIZE,
} from '../models/ap-approval-policy.models';

const SETTINGS: readonly ApPolicySetting[] = [
  'AP_CLERK_APPROVAL_LIMIT',
  'AP_AUTO_APPROVAL_LIMIT',
  'AP_ALLOW_CREATOR_APPROVAL',
  'AP_ALLOW_APPROVER_PAYMENT',
  'AP_DEFAULT_TERMS',
];

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * The AP approval policy (CAP:550 S13 / S14, SPEC-accounting-workspace §5.5):
 * its Bills values and history through `@durion-sdk/accounting`
 * `APApprovalPolicyService` (ADR-0041). Both calls need
 * `accounting:ap_approval_policy:manage`; the Approval limits page gates on it
 * (`ACCOUNTING_PAGE.approvalLimits`, `ACCOUNTING_SECTION.apPolicyManage`).
 */
@Injectable({ providedIn: 'root' })
export class ApApprovalPolicyService {
  private readonly sdk = inject(ApApprovalPolicySdk);

  /** The effective policy and one page of its history, newest first. */
  getPolicy(historyPage = 0, historySize = POLICY_HISTORY_PAGE_SIZE): Observable<ApPolicyRead> {
    return this.sdk.getApApprovalPolicy(historyPage, historySize).pipe(map(toPolicyRead));
  }

  /**
   * Saves the Bills section: both limits in the functional currency, the
   * reason and the intent's `requestId` (a replay of a recorded id writes
   * nothing and answers the current policy, §8.2). Only the Bills keys are
   * sent: a missing setting is unchanged, so the switches and terms this page
   * shows read-only are never written.
   */
  updatePolicy(update: ApPolicyBillsUpdate): Observable<ApPolicyRead> {
    return this.sdk
      .setApApprovalPolicy({
        clerkApprovalLimit: update.clerkApprovalLimit,
        autoApprovalLimit: update.autoApprovalLimit,
        currencyCode: update.currencyCode,
        justification: update.justification,
        requestId: update.requestId,
      })
      .pipe(map(toPolicyRead));
  }
}

function toPolicyRead(view: ApApprovalPolicyResponse): ApPolicyRead {
  return {
    policy: {
      clerkApprovalLimit: view.clerkApprovalLimit,
      autoApprovalLimit: view.autoApprovalLimit,
      currencyCode: view.currencyCode,
      allowCreatorApproval: view.allowCreatorApproval === true,
      allowApproverPayment: view.allowApproverPayment === true,
      defaultTerms: view.defaultTerms,
      asOf: text(view.asOf),
    },
    history: {
      rows: (view.history ?? []).map(toHistoryRow),
      page: view.historyPage ?? 0,
      size: view.historySize ?? POLICY_HISTORY_PAGE_SIZE,
      total: view.historyTotal ?? (view.history ?? []).length,
    },
  };
}

function toHistoryRow(row: ApApprovalPolicyHistoryRow): ApPolicyHistoryRow {
  const setting = (SETTINGS as readonly string[]).includes(row.setting) ? (row.setting as ApPolicySetting) : 'UNKNOWN';
  return {
    changedAt: row.changedAt,
    changedBy: row.changedBy,
    changedByRoles: [...(row.changedByRoles ?? [])],
    setting,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue,
    justification: row.justification,
  };
}
