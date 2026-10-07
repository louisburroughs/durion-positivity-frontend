/**
 * The register's terminal (CAP:550 S22, spec discrepancy 4). The frontend has no terminal
 * identity yet, so the cart (which opens carts on it) and the drawer page (which resolves its
 * session) share this one constant and therefore the same drawer session.
 */
export const REGISTER_TERMINAL_ID = 'DEFAULT';

/** A read's outcome (ADR-0064 §1): what it says is actionable only while `'OK'`. */
export type ReadStatus = 'PENDING' | 'OK' | 'FAILED';

/** The fixed drawer-movement reasons pos-order serves (S16, AW15). No free text, no "Other". */
export type DrawerReason = 'PETTY_EXPENSE' | 'VENDOR_COD' | 'BANK_DROP' | 'FLOAT_INCREASE' | 'FLOAT_DECREASE';

export type DrawerDirection = 'PAID_IN' | 'PAID_OUT';

export const FLOAT_REASONS: readonly DrawerReason[] = ['FLOAT_INCREASE', 'FLOAT_DECREASE'];

/** The reasons offered under **Pay out**, in the order they are listed (§6 item 2). */
export const PAY_OUT_REASONS: readonly DrawerReason[] = ['PETTY_EXPENSE', 'VENDOR_COD', 'BANK_DROP', 'FLOAT_DECREASE'];

/** Translation key of each known reason; anything else reads as Unknown and is never offered. */
const REASON_KEYS: Readonly<Record<DrawerReason, string>> = {
  PETTY_EXPENSE: 'ORDER.DRAWER.REASON.PETTY_EXPENSE',
  VENDOR_COD: 'ORDER.DRAWER.REASON.VENDOR_COD',
  BANK_DROP: 'ORDER.DRAWER.REASON.BANK_DROP',
  FLOAT_INCREASE: 'ORDER.DRAWER.REASON.FLOAT_INCREASE',
  FLOAT_DECREASE: 'ORDER.DRAWER.REASON.FLOAT_DECREASE',
};
export const UNKNOWN_REASON_KEY = 'ORDER.DRAWER.REASON.UNKNOWN';

export function isDrawerReason(value: unknown): value is DrawerReason {
  return typeof value === 'string' && Object.hasOwn(REASON_KEYS, value);
}

export function reasonKey(reason: string | null | undefined): string {
  return isDrawerReason(reason) ? REASON_KEYS[reason] : UNKNOWN_REASON_KEY;
}

/** The register session as served (`RegisterSessionResponse`); every field is server-generated. */
export interface DrawerSession {
  readonly sessionId?: string;
  readonly terminalId?: string;
  readonly status?: string;
  readonly openedAt?: string;
  readonly openingFloat?: number;
  /** ISO 4217 code stamped on the drawer when it opened (ADR-0067): every amount on it uses it. */
  readonly currencyCode?: string;
}

/** One recorded movement as served (`CashMovementResponse`). Recorded movements are immutable. */
export interface DrawerMovement {
  readonly movementId?: string;
  readonly occurredAt?: string;
  /** Null on a movement recorded before the fixed reasons; an unknown code reads as Unknown. */
  readonly reason?: string | null;
  readonly movementType?: DrawerDirection | string;
  readonly amount?: number;
  readonly currencyCode?: string;
  readonly categoryCode?: string;
  readonly vendorId?: string;
  readonly bagNumber?: string;
  readonly note?: string;
  readonly receiptReference?: string;
  /** Served ids, never names (spec discrepancy 3): the page renders an em dash, never these. */
  readonly clerkId?: string;
  readonly approvedBy?: string;
}

/** One reason's options for this session (`ReasonOption`, S16 PROPOSED 5). */
export interface DrawerReasonOption {
  readonly reason: DrawerReason;
  readonly direction: DrawerDirection;
  readonly allowedNow: boolean;
  /** The served cashier limit on the session's running total, or null when there is none. */
  readonly cashierLimit: number | null;
  readonly alwaysNeedsManager: boolean;
  readonly requiredFields: readonly string[];
}

/** One ACTIVE petty-expense category (`CategoryOption`). */
export interface PettyCategory {
  readonly code: string;
  readonly label: string;
  readonly examples: string | null;
}

/**
 * What the register may offer the cashier for one session (`CashMovementOptionsResponse`). Only
 * known reasons are kept. pos-order serves no vendor list yet (S24), so vendor cash on delivery is
 * never offered (spec discrepancy 2) and no vendor field exists here.
 */
export interface DrawerOptions {
  readonly sessionId: string | null;
  readonly currencyCode: string | null;
  readonly reasons: readonly DrawerReasonOption[];
  readonly categories: readonly PettyCategory[];
}

/** The step-up's single-use approval (`CashMovementApprovalResponse`). Held only by the dialog. */
export interface DrawerApproval {
  readonly approvalToken: string;
  readonly expiresAt: string | null;
}

/** What the dialog reports to the page after a confirmed recording. */
export interface RecordedMovement {
  readonly reason: DrawerReason;
  readonly amount: number;
  readonly currencyCode: string;
}

/** Which action opened the dialog. */
export type DrawerDialogKind = 'PAY_OUT' | 'FLOAT';

/**
 * The reasons an action may offer now, as the server allows them (§8.2, P7): **Pay out** offers
 * the allowed OUT reasons, **Change the float** the allowed float reasons. Vendor cash on delivery
 * is never offered: the vendor is picked from a served list and the options read serves none yet
 * (S24; spec discrepancy 2, ADR-0064), so no vendor read can be `'OK'`.
 */
export function offeredReasons(options: DrawerOptions | null, kind: DrawerDialogKind): DrawerReasonOption[] {
  if (!options) {
    return [];
  }
  const listed = kind === 'FLOAT' ? FLOAT_REASONS : PAY_OUT_REASONS;
  const offered: DrawerReasonOption[] = [];
  for (const reason of listed) {
    const option = options.reasons.find(candidate => candidate.reason === reason);
    if (!option?.allowedNow || option.reason === 'VENDOR_COD') {
      continue;
    }
    if (kind === 'PAY_OUT' && option.direction !== 'PAID_OUT') {
      continue;
    }
    offered.push(option);
  }
  return offered;
}
