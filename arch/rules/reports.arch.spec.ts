import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { metrics, projectGraph } from 'archunit';
import { BASELINE_DIR, readBaseline } from '../support/baseline';
import { APP } from '../support/projects';

/**
 * Non-gating reports (plan §5.8): trend data only, no thresholds. CI uploads reports/arch/**.
 */
const OUT = path.resolve('reports/arch');

describe('[RPT] architecture reports (non-gating)', () => {
  beforeAll(() => mkdirSync(OUT, { recursive: true }));

  it('[RPT-01] exports the feature-to-feature dependency graph (LAY-03 debt at a glance)', async () => {
    await projectGraph(APP.tsconfig)
      .focusOn(/^src\/app\/features\//)
      .collapseToFolderDepth(4)
      .titled('Feature dependencies')
      .exportAsMermaid(path.join(OUT, 'features.mmd'));
  });

  it('[RPT-02] exports lines-of-code and LCOM96b metrics as HTML', async () => {
    await metrics(APP.tsconfig).count().exportAsHTML(path.join(OUT, 'count.html'));
    await metrics(APP.tsconfig).lcom().exportAsHTML(path.join(OUT, 'lcom.html'));
  });

  it('[RPT-03] writes baseline-summary.json (the debt burndown)', () => {
    const summary: Record<string, number> = {};
    for (const f of readdirSync(BASELINE_DIR).filter((n) => n.endsWith('.json')).sort()) {
      const id = f.replace(/\.json$/, '');
      summary[id] = readBaseline(id)?.length ?? 0;
    }
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    writeFileSync(path.join(OUT, 'baseline-summary.json'), `${JSON.stringify({ total, rules: summary }, null, 2)}\n`);
    console.info(`[RPT-03] baselined debt: ${total} entries across ${Object.keys(summary).length} rules`);
  });
});
