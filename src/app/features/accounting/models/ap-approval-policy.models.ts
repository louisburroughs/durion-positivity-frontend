/**
 * The AP approval policy behind Approval limits (CAP:550 S13 / S14,
 * SPEC-accounting-workspace §4.3, §5.5), as `@durion-sdk/accounting`
 * `APApprovalPolicyService` serves it. Values are as served (P7).
 */

/** The settings the history names; an unknown one renders as "Unknown setting". */
export type ApPolicySetting =
  | 'AP_CLERK_APPROVAL_LIMIT'
  | 'AP_AUTO_APPROVAL_LIMIT'
  | 'AP_ALLOW_CREATOR_APPROVAL'
  | 'AP_ALLOW_APPROVER_PAYMENT'
  | 'AP_DEFAULT_TERMS'
  | 'UNKNOWN';

/** The Bills section's values. */
export interface ApApprovalPolicy {
  readonly clerkApprovalLimit: number;
  readonly autoApprovalLimit: number;
  /** ISO 4217 functional currency of both limits. */
  readonly currencyCode: string;
  /** Separation-of-duties switches, shown read-only on this page. */
  readonly allowCreatorApproval: boolean;
  readonly allowApproverPayment: boolean;
  readonly defaultTerms: string;
  /** When these values were read. */
  readonly asOf: string | null;
}

/** One history row: who changed which setting, from what to what, and why. */
export interface ApPolicyHistoryRow {
  readonly changedAt: string;
  /** The person's name as served; untrusted text. */
  readonly changedBy: string;
  readonly changedByRoles: readonly string[];
  readonly setting: ApPolicySetting;
  readonly oldValue: string | null;
  readonly newValue: string;
  /** Untrusted text. */
  readonly justification: string;
}

/** One page of the history, newest first. */
export interface ApPolicyHistoryPage {
  readonly rows: readonly ApPolicyHistoryRow[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** One `GET /ap-approval-policy` answer: the policy and one page of its history. */
export interface ApPolicyRead {
  readonly policy: ApApprovalPolicy;
  readonly history: ApPolicyHistoryPage;
}

/** The Bills section of a save. `requestId` is generated once per intent (§8.2). */
export interface ApPolicyBillsUpdate {
  readonly clerkApprovalLimit: number;
  readonly autoApprovalLimit: number;
  readonly currencyCode: string;
  readonly justification: string;
  readonly requestId: string;
}

/** "Why are you changing this?" is at least this long (400 `JUSTIFICATION_REQUIRED`). */
export const POLICY_REASON_MIN = 10;
/** History page size (the read allows at most 100). */
export const POLICY_HISTORY_PAGE_SIZE = 20;
