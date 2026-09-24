import { readFileSync } from 'node:fs';
import { FIXTURES } from '../../support/projects';
import {
  con01,
  con02Finder,
  con03Finder,
  con04Finder,
  con05Finder,
  con06Finder,
  con07Finder,
  con08Finder,
  con09,
} from '../conventions.rules';

/**
 * Self-tests for CON-01..09 (plan §6). Fixture files live under
 * `arch/fixtures/src/app/features/fxcon/`, prefixed `fxcon-*`.
 *
 * CON-02/03/04 finders call `existsSync`/`readFileSync` on `f.path` directly, so they're called
 * with a real repo-relative path pointing at the fixture files on disk — no ArchUnitTS project
 * needed. CON-05/06/07/08 are pure AST content finders and need no filesystem at all.
 *
 * CON-01/09's own finders are constants (the real logic is the subject/except selector
 * composition), so those two run the actual rule factory against the FIXTURES project directly:
 * `FIXTURES.app` is `root`-relative (`'src/app'`, see `support/projects.ts`), the same path space
 * ArchUnitTS's own `FileInfo.path` uses, so the selectors built from it match the fixture files.
 */
const fx = (rel: string): string => `arch/fixtures/src/app/${rel}`;
const read = (rel: string): string => readFileSync(fx(rel), 'utf8');

describe('[self] CON-01 a *.service.ts under features/** lives in a services/ folder', () => {
  it('flags a service outside services/ and leaves one inside services/ alone', async () => {
    const keys = await con01(FIXTURES).keys();
    expect(keys).toContain('src/app/features/fxcon/fxcon-root.service.ts :: not under services/ folder');
    expect(keys.some((k) => k.startsWith('src/app/features/fxcon/services/fxcon-nospec.service.ts'))).toBe(false); // it IS under services/
    for (const k of keys) expect(k.split(' :: ')[0]).not.toMatch(/\/services\//);
  });
});

describe('[self] CON-02 every *.service.ts/*.store.ts has a co-located *.spec.ts', () => {
  it('flags the service with no spec and leaves the one with a spec alone', () => {
    const violating = con02Finder({ path: fx('features/fxcon/services/fxcon-nospec.service.ts'), content: read('features/fxcon/services/fxcon-nospec.service.ts') });
    expect(violating).toEqual(['missing co-located spec']);

    const compliant = con02Finder({ path: fx('features/fxcon/services/fxcon-hasspec.service.ts'), content: read('features/fxcon/services/fxcon-hasspec.service.ts') });
    expect(compliant).toEqual([]);
  });
});

describe('[self] CON-03 (warn) every public method of a *Service class is named in its sibling spec', () => {
  it('flags the method the spec never mentions, not the one it does', () => {
    const findings = con03Finder({ path: fx('features/fxcon/services/fxcon-con03.service.ts'), content: read('features/fxcon/services/fxcon-con03.service.ts') });
    expect(findings.some((f) => f.includes('notCovered'))).toBe(true);
    expect(findings.some((f) => f.includes('.covered '))).toBe(false);
    expect(findings.some((f) => f.includes('helper'))).toBe(false); // private — out of scope
  });
});

describe('[self] CON-04 a @Component under pages/**|components/** follows the four-file convention', () => {
  it('flags the page missing a spec and leaves the fully-compliant page alone', () => {
    const violating = con04Finder({
      path: fx('features/fxcon/pages/fxcon-missing-spec-page/fxcon-missing-spec-page.component.ts'),
      content: read('features/fxcon/pages/fxcon-missing-spec-page/fxcon-missing-spec-page.component.ts'),
    });
    expect(violating).toContain('missing spec');

    const compliant = con04Finder({
      path: fx('features/fxcon/pages/fxcon-compliant-page/fxcon-compliant-page.component.ts'),
      content: read('features/fxcon/pages/fxcon-compliant-page/fxcon-compliant-page.component.ts'),
    });
    expect(compliant).toEqual([]);
  });

  it('§11.4: exempts a single-element inline template, but not a multi-element one', () => {
    const singleElement = con04Finder({
      path: fx('features/fxcon/pages/fxcon-inline-single/fxcon-inline-single-page.component.ts'),
      content: `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-fxcon-inline-single', standalone: true, template: '<app-shell [config]="config" />' })
        export class FxconInlineSinglePageComponent { readonly config = null; }
      `,
    });
    expect(singleElement).toEqual([]);

    const multiElement = con04Finder({
      path: fx('features/fxcon/pages/fxcon-inline-multi/fxcon-inline-multi-page.component.ts'),
      content: `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-fxcon-inline-multi', standalone: true, template: '<p>one</p><p>two</p>' })
        export class FxconInlineMultiPageComponent {}
      `,
    });
    expect(multiElement).toContain('missing spec');
  });
});

describe('[self] CON-05 the four security-audit interfaces are declared only in security-audit.models.ts', () => {
  it('flags a re-declaration elsewhere and leaves an unrelated interface alone', () => {
    const violating = con05Finder({
      path: fx('features/fxcon/models/fxcon-audit.models.ts'),
      content: 'export interface AuditEventFilter { readonly from: string; }',
    });
    expect(violating).toEqual(['interface AuditEventFilter declared outside security-audit.models.ts']);

    const compliant = con05Finder({
      path: fx('features/fxcon/models/fxcon-audit.models.ts'),
      content: 'export interface AuditRecordFilterParams { readonly from: string; }', // similar name, not a listed one
    });
    expect(compliant).toEqual([]);
  });
});

describe('[self] CON-06 no @NgModule, no standalone: false', () => {
  it('flags both shapes and leaves standalone: true alone', () => {
    const ngModule = con06Finder({ path: fx('features/fxcon/fxcon-module.ts'), content: '@NgModule({ declarations: [] })\nexport class FxconModule {}' });
    expect(ngModule).toContain('@NgModule used');

    const standaloneFalse = con06Finder({
      path: fx('features/fxcon/components/fxcon-legacy.component.ts'),
      content: "@Component({ standalone: false })\nexport class FxconLegacyComponent {}",
    });
    expect(standaloneFalse.some((f) => f.includes('standalone: false'))).toBe(true);

    const compliant = con06Finder({
      path: fx('features/fxcon/components/fxcon-ok.component.ts'),
      content: "@Component({ standalone: true })\nexport class FxconOkComponent {}",
    });
    expect(compliant).toEqual([]);
  });
});

describe('[self] CON-07 server-generated timestamp fields are readonly, optional, and carry @serverGenerated', () => {
  it('flags an undocumented required field and leaves a fully-tagged one alone', () => {
    const violating = con07Finder({
      path: fx('features/fxcon/models/fxcon-timestamps.models.ts'),
      content: 'export interface FxconRecord { readonly id: string; createdAt: string; }',
    });
    expect(violating).toEqual(
      expect.arrayContaining(['FxconRecord.createdAt :: not readonly/optional', 'FxconRecord.createdAt :: missing @serverGenerated']),
    );

    const compliant = con07Finder({
      path: fx('features/fxcon/models/fxcon-timestamps.models.ts'),
      content: [
        'export interface FxconRecord {',
        '  readonly id: string;',
        '  /**',
        '   * @serverGenerated - set by server.',
        '   */',
        '  readonly createdAt?: string;',
        '}',
      ].join('\n'),
    });
    expect(compliant).toEqual([]);
  });

  it('a filter/request field with the same name but not in models/** is out of the rule\'s file scope (subject, not tested here)', () => {
    // The subject regex (selectors.models) is what keeps request/filter DTOs living outside models/**
    // out of scope; the finder itself only looks at property names, which is exercised above.
    expect(true).toBe(true);
  });
});

describe('[self] CON-08 a server-generated key must not appear in a create*/update*/post/put/patch payload', () => {
  it('flags a server key sent on create/post and leaves a clean payload alone', () => {
    const violating = con08Finder({
      path: fx('features/fxcon/services/fxcon-write.service.ts'),
      content: `
        class FxconWriteService {
          save(dto: unknown) {
            return this.sdk.createInvoice({ customerId: '1', createdAt: dto });
          }
        }
      `,
    });
    expect(violating.some((f) => f.includes('createdAt'))).toBe(true);

    const compliant = con08Finder({
      path: fx('features/fxcon/services/fxcon-write.service.ts'),
      content: `
        class FxconWriteService {
          save() {
            return this.sdk.createInvoice({ customerId: '1' });
          }
        }
      `,
    });
    expect(compliant).toEqual([]);
  });
});

describe('[self] CON-09 (ratchet) only utils/ is used as the folder name, not util/', () => {
  it('flags a file under util/ and leaves one under utils/ alone', async () => {
    const keys = await con09(FIXTURES).keys();
    expect(keys).toContain('src/app/features/fxcon/util/fxcon-legacy.ts :: file under a util/ folder — rename the folder to utils/');
    expect(keys.some((k) => k.startsWith('src/app/features/fxcon/utils/fxcon-current.ts'))).toBe(false);
    for (const k of keys) expect(k.split(' :: ')[0]).toMatch(/\/util\//); // never a utils/ path
  });
});
