/** Type surface for check-missing-keys.mjs's `scan()`, used by arch/rules/i18n.rules.ts (I18N-01). */

export interface LocaleDiff {
  readonly locale: string;
  readonly keyCount: number;
  readonly missing: string[];
  readonly extras: string[];
  readonly typeMismatches: string[];
}

export interface MissingKeysScanOptions {
  /** Overrides the locale directory (default: `src/assets/i18n` under the repo root). */
  readonly i18nDir?: string;
}

export interface MissingKeysScanResult {
  readonly baseLocale: string;
  readonly baseKeyCount: number;
  readonly diffs: LocaleDiff[];
}

export function scan(options?: MissingKeysScanOptions): MissingKeysScanResult;
