/**
 * The one adapter from ArchUnitTS violation objects to stable baseline keys (plan §11.3.6).
 * Keys never carry line numbers, so unrelated edits don't churn a baseline.
 */

interface Edge {
  sourceLabel?: string;
  targetLabel?: string;
  source?: string;
  target?: string;
}

/** Returns null for violations that are not findings (self-edges). */
export function violationKey(v: unknown): string | null {
  const o = v as Record<string, any>;
  if (o['dependency'] && typeof o['dependency'] === 'object') {
    const d = o['dependency'] as Edge;
    const s = d.sourceLabel ?? d.source;
    const t = d.targetLabel ?? d.target;
    if (s === t) return null;
    return `${s} -> ${t}`;
  }
  if (Array.isArray(o['cycle'])) {
    const members = new Set<string>();
    for (const e of o['cycle'] as Edge[]) {
      members.add(String(e.sourceLabel ?? e.source));
      members.add(String(e.targetLabel ?? e.target));
    }
    return `cycle :: ${[...members].sort().join(' , ')}`;
  }
  if (o['fileInfo'] && typeof o['fileInfo'] === 'object') {
    return `${o['fileInfo'].path}`;
  }
  if (o['projectedNode']?.label) {
    return `${o['projectedNode'].label}`;
  }
  if ('filters' in o && typeof o['message'] === 'string') {
    return `EMPTY :: ${o['message']}`;
  }
  return `UNKNOWN :: ${JSON.stringify(o).slice(0, 300)}`;
}

/** True when every edge behind a dependency violation is a type-only import. */
export function isTypeOnlyDependency(v: unknown): boolean {
  const d = (v as Record<string, any>)['dependency'];
  const edges = d?.cumulatedEdges as { importKinds?: string[] }[] | undefined;
  return !!edges?.length && edges.every((e) => e.importKinds?.includes('type'));
}
