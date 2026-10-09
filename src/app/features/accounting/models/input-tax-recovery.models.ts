/**
 * Input-tax recovery behind Approval limits' **Petty-expense categories** section (CAP:550 S33,
 * SPEC-accounting-workspace §4.7, §5.5), as `@durion-sdk/accounting`
 * `AccountingInputTaxRecoveryService.getInputTaxRecovery` serves it (S32d).
 *
 * Multi-national by configuration (owner direction 2026-10-08): regimes, tax types, countries and
 * evidence rules are served codes; nothing here names one. Whether recovery is on comes only from
 * the served `regimes[].enabled`, never from a currency, locale or country (§4.7). The client
 * computes no money (P7): amounts and shares are shown as served.
 */

/** One regime the tenant holds a registration for (`InputTaxRecoveryRegime`). */
export interface RecoveryRegime {
  /** ISO 3166-1 alpha-2, as served. */
  readonly countryCode: string;
  /** The regime code as the country profile names it; shown as served text. */
  readonly regime: string;
  /**
   * Recovery is on today (true) or off (false); null means it cannot be determined now (the tax
   * service did not answer), never off.
   */
  readonly enabled: boolean | null;
  /**
   * The tenant's own registration number. INTERNAL under ADR-0072 Decision 1 (a published
   * indirect-tax registration, shape-checked by its owner); rendered as text (ADR-0065), never stored.
   */
  readonly registrationNumber: string | null;
  /** First effective day (`YYYY-MM-DD`). */
  readonly since: string | null;
  /** Where recovered tax is recorded: account name and number (shown with accounting terms on). */
  readonly accountName: string | null;
  readonly accountCode: string | null;
}

/** One evidence rule in effect today (`InputTaxRecoveryEvidenceRule`). */
export interface RecoveryEvidenceRule {
  /** Document types it applies to (served codes). */
  readonly appliesTo: readonly string[];
  readonly rule: string;
  /** Document total, tax included, from which it applies; never rounded. */
  readonly threshold: number;
}

/** A registered country's evidence rules (`InputTaxRecoveryCountryEvidenceRules`). */
export interface RecoveryCountryEvidence {
  readonly countryCode: string;
  /** ISO 4217 of every threshold; null when not served. */
  readonly currencyCode: string | null;
  readonly rules: readonly RecoveryEvidenceRule[];
}

/** A petty-expense category's recovery (`InputTaxRecoveryCategory`). */
export interface RecoveryCategory {
  readonly code: string;
  /** Untrusted text. */
  readonly label: string;
  readonly taxRecoverable: boolean;
  /** Share recovered; null when not recoverable. */
  readonly recoverablePercent: number | null;
  /** @serverGenerated The setting's version (0 when never set), sent back with a change. */
  readonly version: number;
}

/**
 * One change to a category's recovery (`InputTaxRecoveryHistoryItem`). The served actor is a login
 * username and is never shown (Accounting ruling Q4 on #464), so it is not kept; the role is.
 */
export interface RecoveryChange {
  readonly code: string;
  /** When it took effect (an instant). */
  readonly effectiveFrom: string;
  /** Role code the actor acted in, when served. */
  readonly actorRole: string | null;
  /** Null for the first setting. */
  readonly oldTaxRecoverable: boolean | null;
  readonly oldRecoverablePercent: number | null;
  readonly newTaxRecoverable: boolean;
  readonly newRecoverablePercent: number | null;
  /** Untrusted text. */
  readonly reason: string;
}

/** `GET /v1/accounting/input-tax-recovery`. */
export interface InputTaxRecovery {
  readonly asOf: string;
  readonly regimes: readonly RecoveryRegime[];
  /** Null when the tax service did not answer. */
  readonly evidence: readonly RecoveryCountryEvidence[] | null;
  readonly categories: readonly RecoveryCategory[];
  /** Oldest first, as served. */
  readonly history: readonly RecoveryChange[];
}

/**
 * Whether the shop claims tax back today, from the served regimes only (§4.7):
 * - `ON`: at least one regime's recovery is on;
 * - `UNKNOWN`: none is on and at least one cannot be determined now (never read as off);
 * - `OFF`: no registration, or every registered regime's recovery is off.
 */
export type RecoveryState = 'ON' | 'OFF' | 'UNKNOWN';

export function recoveryState(read: InputTaxRecovery): RecoveryState {
  if (read.regimes.some(regime => regime.enabled === true)) return 'ON';
  if (read.regimes.some(regime => regime.enabled === null)) return 'UNKNOWN';
  return 'OFF';
}

/** The document type the drawer's receipts are, as the evidence rules name it (AW53). */
export const DRAWER_RECEIPT_DOCUMENT = 'DRAWER_RECEIPT';

/**
 * The evidence threshold a drawer receipt meets for the supplier's number, from the countries whose
 * recovery is on: one amount and its currency when the served rules agree on exactly one, otherwise
 * null (the copy then names no amount rather than pick one).
 */
export function drawerEvidenceThreshold(read: InputTaxRecovery): { readonly amount: number; readonly currencyCode: string } | null {
  const countries = new Set(read.regimes.filter(regime => regime.enabled === true).map(regime => regime.countryCode));
  const found = new Map<string, { readonly amount: number; readonly currencyCode: string }>();
  for (const country of read.evidence ?? []) {
    if (!countries.has(country.countryCode) || !country.currencyCode) continue;
    for (const rule of country.rules) {
      if (!rule.appliesTo.includes(DRAWER_RECEIPT_DOCUMENT)) continue;
      found.set(`${rule.threshold}|${country.currencyCode}`, { amount: rule.threshold, currencyCode: country.currencyCode });
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

/** The three shares the Change share dialog offers (§5.5): not claimed, half, all. */
export type ShareChoice = 'NONE' | 'HALF' | 'ALL';

export const SHARE_CHOICES: readonly ShareChoice[] = ['NONE', 'HALF', 'ALL'];

/** The served setting as one of the offered choices, or null for any other share. */
export function choiceOf(category: Pick<RecoveryCategory, 'taxRecoverable' | 'recoverablePercent'>): ShareChoice | null {
  if (!category.taxRecoverable) return 'NONE';
  if (category.recoverablePercent === 50) return 'HALF';
  if (category.recoverablePercent === 100) return 'ALL';
  return null;
}

/** `PUT …/petty-expense-categories/{code}/tax-recovery`. */
export interface TaxShareCommand {
  readonly taxRecoverable: boolean;
  /** In (0, 100]; absent when not recoverable. */
  readonly recoverablePercent: number | null;
  readonly version: number;
  readonly justification: string;
  readonly requestId: string;
}

/** The setting as the write answers it. */
export interface TaxShareResult {
  readonly code: string;
  readonly taxRecoverable: boolean;
  readonly recoverablePercent: number | null;
  readonly version: number;
  readonly replayed: boolean;
}

/** "Why are you changing this?" is at least this long (§5.5). */
export const SHARE_REASON_MIN = 10;
