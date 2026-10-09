import { ConfigurableDrawerType, DrawerPolicy, DrawerPolicyUpdate, DrawerTypePolicy } from '../models/drawer-policy.models';

/** An amount as typed: non-negative, at most two decimals (format only; the server decides, §9.5). */
const AMOUNT = /^\d{1,13}(\.\d{1,2})?$/;

/** A typed amount as a number, or null while it is not a valid amount. Never rounded (ADR-0067 PC-6). */
export function parseAmount(text: string): number | null {
  const value = text.trim();
  return AMOUNT.test(value) ? Number(value) : null;
}

/** One configurable type as edited: the switch and the amount text (kept while off). */
export interface DrawerTypeDraft {
  readonly allowed: boolean;
  readonly limitText: string;
}

/** The Drawer cash section as edited. */
export interface DrawerDraft {
  readonly pettyExpense: DrawerTypeDraft;
  readonly vendorCod: DrawerTypeDraft;
  readonly toleranceText: string;
}

/** The fields a drawer refusal can mark (the PUT's field names). */
export type DrawerField = 'pettyExpense.cashierLimit' | 'vendorCod.cashierLimit' | 'overShortTolerance' | 'justification';

/** Why an amount field is invalid: missing while required, or not an amount. */
export type AmountProblem = 'REQUIRED' | 'AMOUNT' | null;

export const DRAWER_TYPE_KEY: Readonly<Record<ConfigurableDrawerType, 'pettyExpense' | 'vendorCod'>> = {
  PETTY_EXPENSE: 'pettyExpense',
  VENDOR_COD: 'vendorCod',
};

const amountText = (value: number | null): string => (value === null ? '' : String(value));

/** The served editable row of a configurable type, if any. */
export function configurableRow(policy: DrawerPolicy, type: ConfigurableDrawerType): DrawerTypePolicy | null {
  return policy.types.find(row => row.type === type && row.editable) ?? null;
}

/** The draft a served policy starts from. */
export function draftFrom(policy: DrawerPolicy): DrawerDraft {
  const type = (kind: ConfigurableDrawerType): DrawerTypeDraft => {
    const row = configurableRow(policy, kind);
    return { allowed: row?.allowed ?? false, limitText: amountText(row?.cashierLimit ?? null) };
  };
  return { pettyExpense: type('PETTY_EXPENSE'), vendorCod: type('VENDOR_COD'), toleranceText: amountText(policy.overShortTolerance) };
}

/** A cashier amount is required while its type is on; while off it is disabled with its value kept. */
export function limitProblem(draft: DrawerTypeDraft): AmountProblem {
  if (!draft.allowed) return null;
  if (!draft.limitText.trim()) return 'REQUIRED';
  return parseAmount(draft.limitText) === null ? 'AMOUNT' : null;
}

export function toleranceProblem(text: string): AmountProblem {
  if (!text.trim()) return 'REQUIRED';
  return parseAmount(text) === null ? 'AMOUNT' : null;
}

/** True when every visible drawer field is valid. Only served editable types are visible. */
export function drawerValid(draft: DrawerDraft, policy: DrawerPolicy): boolean {
  const typesValid = (Object.keys(DRAWER_TYPE_KEY) as ConfigurableDrawerType[]).every(
    type => !configurableRow(policy, type) || limitProblem(draft[DRAWER_TYPE_KEY[type]]) === null,
  );
  return typesValid && toleranceProblem(draft.toleranceText) === null;
}

/**
 * The setting a draft type would send, never rounded. While on, the typed amount
 * (validated as required). While off, the kept amount when it reads as one,
 * otherwise the served limit: a switched-off type never clears its stored limit.
 */
function typeSetting(draft: DrawerTypeDraft, row: DrawerTypePolicy): { allowed: boolean; cashierLimit: number | null } {
  const typed = parseAmount(draft.limitText);
  if (draft.allowed) return { allowed: true, cashierLimit: typed };
  return { allowed: false, cashierLimit: typed ?? row.cashierLimit };
}

/** True when the draft differs from the served policy. */
export function drawerDirty(draft: DrawerDraft, policy: DrawerPolicy): boolean {
  const changed = (type: ConfigurableDrawerType): boolean => {
    const row = configurableRow(policy, type);
    if (!row) return false;
    const typed = typeSetting(draft[DRAWER_TYPE_KEY[type]], row);
    return typed.allowed !== row.allowed || typed.cashierLimit !== row.cashierLimit;
  };
  return changed('PETTY_EXPENSE') || changed('VENDOR_COD') || parseAmount(draft.toleranceText) !== policy.overShortTolerance;
}

/**
 * The full replacement a valid draft sends (S16 PUT), or null when the served
 * policy lacks a configurable type or the draft is invalid — the section then
 * cannot be saved, and nothing is made up for it.
 */
export function toDrawerUpdate(draft: DrawerDraft, policy: DrawerPolicy, justification: string): DrawerPolicyUpdate | null {
  const tolerance = parseAmount(draft.toleranceText);
  const petty = configurableRow(policy, 'PETTY_EXPENSE');
  const cod = configurableRow(policy, 'VENDOR_COD');
  if (!petty || !cod || tolerance === null || !drawerValid(draft, policy)) return null;
  return {
    version: policy.version,
    currencyCode: policy.currencyCode,
    pettyExpense: typeSetting(draft.pettyExpense, petty),
    vendorCod: typeSetting(draft.vendorCod, cod),
    overShortTolerance: tolerance,
    justification,
  };
}

/**
 * Rebases an edited draft onto a newer served policy, field by field (after a
 * 409 re-read): a field still holding the value it was filled from takes the
 * new served value; a field the person changed keeps what they typed. A full
 * replacement then never writes back a value someone else just changed.
 */
export function rebaseDraft(draft: DrawerDraft, from: DrawerPolicy, to: DrawerPolicy): DrawerDraft {
  const fresh = draftFrom(to);
  const type = (kind: ConfigurableDrawerType): DrawerTypeDraft => {
    const key = DRAWER_TYPE_KEY[kind];
    const typed = draft[key];
    const before = configurableRow(from, kind);
    if (!before) return fresh[key];
    const limitUntouched = typed.limitText.trim() ? parseAmount(typed.limitText) === before.cashierLimit : before.cashierLimit === null;
    return {
      allowed: typed.allowed === before.allowed ? fresh[key].allowed : typed.allowed,
      limitText: limitUntouched ? fresh[key].limitText : typed.limitText,
    };
  };
  const toleranceUntouched = parseAmount(draft.toleranceText) === from.overShortTolerance;
  return {
    pettyExpense: type('PETTY_EXPENSE'),
    vendorCod: type('VENDOR_COD'),
    toleranceText: toleranceUntouched ? fresh.toleranceText : draft.toleranceText,
  };
}
