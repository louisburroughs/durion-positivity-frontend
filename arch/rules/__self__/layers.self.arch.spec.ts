import { FIXTURES } from '../../support/projects';
import { lay01, lay02, lay03, lay03d, lay04, lay05, lay06, lay07, lay08 } from '../layers.rules';

/**
 * Self-tests for layers.rules.ts (plan §6): each rule factory runs against the FIXTURES project and
 * is shown to fire on a planted violation, and to stay quiet on the matching compliant shape. Uses
 * toContain/not.toContain, never exact equality, since other agents plant fixtures in the same tree
 * concurrently (plan brief).
 *
 * Expected keys are built from `FIXTURES.app` directly: `Project.app` is `root`-relative (see
 * `support/projects.ts`), the same path space ArchUnitTS's own `FileInfo.path` uses, so no
 * re-derivation is needed here.
 */
const FX = FIXTURES;
const A = `${FX.app}/features/fxlay-a`;
const B = `${FX.app}/features/fxlay-b`;

describe('[LAY-01] core/** must not depend on features/**', () => {
  it('has no fixture violation planted (core-only fixture is fixture-core.ts)', async () => {
    const keys = await lay01(FIXTURES).keys();
    expect(keys.every((k) => !k.startsWith(`${FX.app}/core/`))).toBe(true);
  });
});

describe('[LAY-02] shared/** must not depend on features/**', () => {
  it('fires when shared imports a feature', async () => {
    const keys = await lay02(FIXTURES).keys();
    expect(keys).toContain(`${FX.app}/shared/fxlay-shared-violate.ts -> ${A}/fxlay-a-target.ts`);
  });
  it('stays quiet on a shared file with no feature dependency', async () => {
    const keys = await lay02(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${FX.app}/shared/fxlay-shared-ok.ts`))).toBe(false);
  });
});

describe('[LAY-03] a feature must not depend on another feature', () => {
  it('fires when fxlay-b depends on fxlay-a', async () => {
    const keys = await lay03(FIXTURES).keys();
    expect(keys).toContain(`${B}/fxlay-lay03-violate.ts -> ${A}/fxlay-a-target.ts`);
  });
  it('stays quiet on same-domain and same-feature imports', async () => {
    const keys = await lay03(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${B}/fxlay-lay03-compliant.ts`))).toBe(false);
  });
});

describe('[LAY-03d] a feature must not dynamically import() another feature', () => {
  it('fires on a cross-feature dynamic import()', async () => {
    const keys = await lay03d(FIXTURES).keys();
    expect(keys).toContain(`${B}/fxlay-lay03d-violate.ts :: import('../fxlay-a/fxlay-a-target')`);
  });
  it('stays quiet on a same-domain dynamic import() and a package dynamic import()', async () => {
    const keys = await lay03d(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${B}/fxlay-lay03d-compliant.ts`))).toBe(false);
  });
});

describe("[LAY-04] a feature must not import another feature's models/", () => {
  it('fires when fxlay-b imports fxlay-a/models/', async () => {
    const keys = await lay04(FIXTURES).keys();
    expect(keys).toContain(`${B}/fxlay-lay04-violate.ts -> ${A}/models/fxlay-a.model.ts`);
  });
  it('stays quiet on an import of the same feature’s own models/', async () => {
    const keys = await lay04(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${B}/fxlay-lay04-compliant.ts`))).toBe(false);
  });
});

describe('[LAY-05] models/** must not depend on services/pages/components, nor import @angular/*/rxjs at runtime', () => {
  it('fires when a model depends on a service', async () => {
    const keys = await lay05(FIXTURES).keys();
    expect(keys).toContain(`${A}/models/fxlay-lay05-violate-dep.ts -> ${A}/services/fxlay-a.service.ts`);
  });
  it('fires when a model imports @angular/*/rxjs at runtime', async () => {
    const keys = await lay05(FIXTURES).keys();
    expect(keys).toContain(`${A}/models/fxlay-lay05-violate-angular.ts :: '@angular/core'`);
    expect(keys).toContain(`${A}/models/fxlay-lay05-violate-angular.ts :: 'rxjs'`);
  });
  it('allows type-only @angular/*/rxjs imports in a model', async () => {
    const keys = await lay05(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/models/fxlay-lay05-compliant.ts`))).toBe(false);
  });
});

describe('[LAY-06] services/** must not depend on pages/**/components/**', () => {
  it('fires when a service depends on a page', async () => {
    const keys = await lay06(FIXTURES).keys();
    expect(keys).toContain(`${A}/services/fxlay-lay06-violate.service.ts -> ${A}/pages/fxlay-a.page.ts`);
  });
  it('stays quiet on a service with no page/component dependency', async () => {
    const keys = await lay06(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/services/fxlay-a.service.ts`))).toBe(false);
  });
});

describe('[LAY-07] no import cycles within src/app/**', () => {
  it('fires on a planted two-file cycle', async () => {
    const keys = await lay07(FIXTURES).keys();
    const hit = keys.find(
      (k) => k.includes('fxlay07-cycle-a.ts') && k.includes('fxlay07-cycle-b.ts'),
    );
    expect(hit).toBeDefined();
  });
  it('stays quiet on an acyclic chain', async () => {
    const keys = await lay07(FIXTURES).keys();
    expect(keys.some((k) => k.includes('fxlay07-nocycle'))).toBe(false);
  });
});

describe('[LAY-08] only core/**, app.config*.ts and main*.ts may import src/environments/**', () => {
  it('fires when a feature file reads src/environments/** directly', async () => {
    const keys = await lay08(FIXTURES).keys();
    expect(keys).toContain(`${A}/fxlay08-violate.ts -> ${FX.src}/environments/environment.ts`);
  });
  it('allows app.config.ts and core/** to read src/environments/**', async () => {
    const keys = await lay08(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${FX.app}/app.config.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${FX.app}/core/`))).toBe(false);
  });
});
