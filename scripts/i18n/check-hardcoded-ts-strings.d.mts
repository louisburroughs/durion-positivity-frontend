/**
 * Type surface for check-hardcoded-ts-strings.mjs's `scan()`, used by arch/rules/i18n.rules.ts
 * (I18N-04).
 */

export interface HardcodedFinding {
  readonly file: string;
  readonly lineNo: number;
  readonly kind: string;
  readonly text: string;
}

export interface HardcodedScanOptions {
  /** Paths to narrow the scan; empty/absent scans the whole `src/app` tree. */
  readonly targets?: string[];
}

export interface HardcodedScanResult {
  readonly targets: string[];
  readonly files: string[];
  readonly findings: HardcodedFinding[];
  readonly suppressed: number;
}

export function scan(options?: HardcodedScanOptions): HardcodedScanResult;
