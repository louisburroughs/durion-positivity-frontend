import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ArchRule } from './rule';

/**
 * The shrink-only ratchet (plan §3.3).
 *
 * - New keys fail and are printed with the rule title.
 * - Stale keys (baseline entries that no longer occur) fail with "delete this entry".
 *   `ARCH_BASELINE_PRUNE=1` deletes them instead. There is no mode that adds entries: a new entry
 *   is a hand edit with a mandatory `reason`.
 */
export interface BaselineEntry {
  key: string;
  reason: string;
  /** Tracking issue, e.g. `#347`. Required: untracked debt has no owner to burn it down. */
  tracking: string;
}

export const BASELINE_DIR = path.resolve('arch/baselines');

export const baselinePath = (id: string): string => path.join(BASELINE_DIR, `${id}.json`);

export function readBaseline(id: string): BaselineEntry[] | null {
  const file = baselinePath(id);
  if (!existsSync(file)) return null;
  return validateEntries(file, JSON.parse(readFileSync(file, 'utf8')) as BaselineEntry[]);
}

/** Every entry needs a key, a reason and a `#123` tracking issue (plan §3.3). */
export function validateEntries(file: string, entries: BaselineEntry[]): BaselineEntry[] {
  for (const e of entries) {
    if (!e.key || !e.reason?.trim() || !/^#\d+$/.test(e.tracking?.trim() ?? '')) {
      throw new Error(`${file}: every entry needs a non-empty "key", "reason" and a "tracking" issue (#123)`);
    }
  }
  return entries;
}

export interface Outcome {
  added: string[];
  stale: string[];
  count: number;
}

/** Pure comparison, exported for self-tests. */
export function compare(keys: string[], baseline: BaselineEntry[] | null): Outcome {
  const known = new Set((baseline ?? []).map((e) => e.key));
  const now = new Set(keys);
  return {
    added: keys.filter((k) => !known.has(k)),
    stale: [...known].filter((k) => !now.has(k)),
    count: keys.length,
  };
}

const prune = (): boolean => process.env['ARCH_BASELINE_PRUNE'] === '1';

const label = (r: ArchRule): string => `[${r.id}] ${r.title}`;

/** Test title for a rule: `[SDK-02] pages … (ADR-0041 §2)`. */
export const title = label;

export function formatFailure(r: ArchRule, o: Outcome): string {
  const lines: string[] = [];
  if (o.added.length) {
    lines.push(`${label(r)}: ${o.added.length} new violation(s):`, ...o.added.map((k) => `  + ${k}`));
    lines.push('  Fix the code. Adding a baseline entry to make the suite pass is not the fix (arch/README.md).');
  }
  if (o.stale.length) {
    lines.push(
      `${label(r)}: ${o.stale.length} baseline entr${o.stale.length === 1 ? 'y no longer occurs' : 'ies no longer occur'} — delete ${
        o.stale.length === 1 ? 'this entry' : 'these entries'
      } from arch/baselines/${r.id}.json (or run ARCH_BASELINE_PRUNE=1 npm run test:arch):`,
      ...o.stale.map((k) => `  - ${k}`),
    );
  }
  return lines.join('\n');
}

/** Assert a rule per its mode. */
export async function verify(r: ArchRule): Promise<void> {
  const keys = await r.keys();
  const baseline = readBaseline(r.id);

  if (r.mode === 'warn') {
    if (keys.length) console.warn(`${label(r)} (warn): ${keys.length}\n${keys.map((k) => `  ~ ${k}`).join('\n')}`);
    return;
  }
  if (r.mode === 'enforce' && baseline) {
    throw new Error(`${label(r)} is Enforce but arch/baselines/${r.id}.json exists. Enforce rules never have a baseline.`);
  }
  if (r.mode === 'ratchet' && !baseline && keys.length === 0) {
    throw new Error(`${label(r)} is Ratchet with no debt: switch it to Enforce.`);
  }

  const o = compare(keys, baseline);
  if (o.stale.length && prune() && baseline) {
    const kept = baseline.filter((e) => !o.stale.includes(e.key));
    if (kept.length) writeFileSync(baselinePath(r.id), `${JSON.stringify(kept, null, 2)}\n`);
    else rmSync(baselinePath(r.id));
    console.info(`${label(r)}: pruned ${o.stale.length} stale baseline entr${o.stale.length === 1 ? 'y' : 'ies'}`);
    o.stale = [];
  }
  if (o.added.length || o.stale.length) throw new Error(formatFailure(r, o));
  if (r.mode === 'ratchet') console.info(`${label(r)}: ${o.count} baselined`);
}

/** Register a rule as one Vitest test. */
export function archTest(r: ArchRule): void {
  it(title(r), () => verify(r));
}
