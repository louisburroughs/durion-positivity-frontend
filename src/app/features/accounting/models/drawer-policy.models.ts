/**
 * The drawer policy behind Approval limits' Drawer cash section (CAP:550 S16 /
 * S21, SPEC-accounting-workspace §4.6, §5.5), as `@durion-sdk/order`
 * `RegisterSessionsService` serves it. Order owns these settings (AW19); the
 * page reads and writes them only through pos-order. Values are as served (P7).
 */

/** The served movement types; anything else renders a read-only "Unknown" row (§8.2). */
export type DrawerMovementType = 'PETTY_EXPENSE' | 'VENDOR_COD' | 'BANK_DROP' | 'FLOAT_CHANGE' | 'UNKNOWN';

/** The two types the policy may change (S16: the others are read-only rows). */
export type ConfigurableDrawerType = 'PETTY_EXPENSE' | 'VENDOR_COD';

/** One served movement type row, in served order. */
export interface DrawerTypePolicy {
  readonly type: DrawerMovementType;
  readonly allowed: boolean;
  /** Cashier limit on one drawer session's running total; null when there is none. */
  readonly cashierLimit: number | null;
  readonly alwaysNeedsManager: boolean;
  /** False: a read-only row. */
  readonly editable: boolean;
}

/** The settings the drawer history names; an unknown one renders as "Unknown setting". */
export type DrawerPolicySetting =
  | 'PETTY_EXPENSE_ALLOWED'
  | 'PETTY_EXPENSE_LIMIT'
  | 'VENDOR_COD_ALLOWED'
  | 'VENDOR_COD_LIMIT'
  | 'OVER_SHORT_TOLERANCE'
  | 'UNKNOWN';

/**
 * One drawer history row. The served actor is a login username, an account
 * identifier that is never shown (Accounting ruling Q4 on #464), so it is not
 * kept; pos-order serves no role for it (contract gap, reported on #466).
 */
export interface DrawerPolicyHistoryRow {
  readonly changedAt: string;
  readonly setting: DrawerPolicySetting;
  readonly oldValue: string | null;
  readonly newValue: string | null;
  /** Untrusted text. */
  readonly justification: string;
}

/** The tenant's drawer policy. */
export interface DrawerPolicy {
  /** @serverGenerated The stored version; null while the defaults apply. Sent back as read. */
  readonly version: number | null;
  /** ISO 4217 functional currency of the limits and the tolerance. */
  readonly currencyCode: string;
  readonly types: readonly DrawerTypePolicy[];
  /** Over/short above which a close needs a manager; null only if the read omitted it. */
  readonly overShortTolerance: number | null;
}

/** One `GET /v1/orders/session-policy` answer: the policy and its history, newest first. */
export interface DrawerPolicyRead {
  readonly policy: DrawerPolicy;
  readonly history: readonly DrawerPolicyHistoryRow[];
}

/** One configurable type as sent: `cashierLimit` is required while allowed. */
export interface DrawerTypeSetting {
  readonly allowed: boolean;
  readonly cashierLimit: number | null;
}

/** A full replacement of the configurable settings (S16 `updateSessionPolicy`). */
export interface DrawerPolicyUpdate {
  readonly version: number | null;
  readonly currencyCode: string;
  readonly pettyExpense: DrawerTypeSetting;
  readonly vendorCod: DrawerTypeSetting;
  readonly overShortTolerance: number;
  readonly justification: string;
}
