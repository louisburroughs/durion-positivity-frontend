/**
 * Type surface for generate-pseudo-locale.mjs's pure functions, used by arch/rules/i18n.rules.ts
 * (I18N-02).
 */

export interface PseudoLocaleCheckResult {
  readonly ok: boolean;
  readonly reason: 'missing' | 'stale' | null;
}

export function computePseudoLocale(): string;
export function checkPseudoLocale(): PseudoLocaleCheckResult;
