import { selectors, under, type Project } from '../../support/projects';
import { APP } from '../../support/projects';
import { ts } from '../../support/ast';
import {
  inTryBlock,
  ten01Finder,
  ten02Finder,
  ten03Allow,
  ten03Finder,
  ten04Finder,
  ten05Allow,
  ten05Finder,
  ten06Finder,
  ten07Finder,
  ten08Finder,
} from '../tenancy.rules';

/**
 * Fixture project for TEN-06, which needs a Project (its classification table is path-based).
 * Distinct from the shared FIXTURES tree (arch/fixtures) so this file doesn't collide with other
 * agents' fixtures there — TEN-06 is tested purely against inline {path, content} sources.
 */
const TEST_PROJECT: Project = { tsconfig: 'unused', root: '.', app: 'src/app', src: 'src' };

describe('[TEN-01] no tenant/location header string literals', () => {
  it('flags an exact header string literal', () => {
    expect(ten01Finder({ path: 'x.ts', content: `const h = 'X-Tenant-Id';` })).toEqual(['string literal: X-Tenant-Id']);
  });
  it('is case-insensitive', () => {
    expect(ten01Finder({ path: 'x.ts', content: `const h = 'x-tenant-slug';` })).toHaveLength(1);
  });
  it('ignores a comment mention', () => {
    expect(ten01Finder({ path: 'x.ts', content: `// derives X-Tenant-Id from the token\nconst h = 1;` })).toEqual([]);
  });
  it('does not match a literal that only shares a prefix', () => {
    expect(ten01Finder({ path: 'x.ts', content: `const h = 'X-Tenant-Id-Extra';` })).toEqual([]);
  });
});

describe('[TEN-02] no tenantId identifier/key/literal', () => {
  it('flags a tenantId variable declaration', () => {
    expect(ten02Finder({ path: 'x.ts', content: `const tenantId = getId();` })).toEqual(['identifier: tenantId']);
  });
  it('flags a tenantId object-literal key', () => {
    expect(ten02Finder({ path: 'x.ts', content: `const body = { tenantId: id };` })).toContain('property key: tenantId');
  });
  it('flags a tenantId string literal (e.g. HttpParams.set)', () => {
    expect(ten02Finder({ path: 'x.ts', content: `params.set('tenantId', id);` })).toContain('string literal: tenantId');
  });
  it('does not flag a property-access read of an existing claim (TEN-05 territory)', () => {
    expect(ten02Finder({ path: 'x.ts', content: `const t = claims.tenantId;` })).toEqual([]);
  });
  it('does not flag a type-position tid field', () => {
    expect(ten02Finder({ path: 'x.ts', content: `function f(c: { tid?: string }): void {}` })).toEqual([]);
  });
  it('ignores a comment mention', () => {
    expect(ten02Finder({ path: 'x.ts', content: `// never send tenantId\nconst x = 1;` })).toEqual([]);
  });

  it('the platform-admin carve-out is a real path match (tenant-detail-page)', () => {
    expect(under(APP, 'features/platform').test('src/app/features/platform/pages/tenant-detail/tenant-detail-page.component.ts')).toBe(
      true,
    );
  });
  it('core is a real path match (auth.service)', () => {
    expect(selectors.core(APP).test('src/app/core/services/auth.service.ts')).toBe(true);
  });
});

describe('[TEN-03] tenantSlug confined to the login/platform contract', () => {
  it('flags a bare tenantSlug identifier', () => {
    expect(ten03Finder({ path: 'x.ts', content: `const tenantSlug = normalize(raw);` })).toEqual(['identifier: tenantSlug']);
  });
  it('ignores a comment mention', () => {
    expect(ten03Finder({ path: 'x.ts', content: `// tenantSlug is the login contract\nconst x = 1;` })).toEqual([]);
  });
  it('the login carve-out is a real path match (login.component.ts)', () => {
    expect(ten03Allow(APP).some((r) => r.test('src/app/features/auth/login.component.ts'))).toBe(true);
  });
  it('the platform-admin carve-out is a real path match (tenant-create-page)', () => {
    expect(
      ten03Allow(APP).some((r) => r.test('src/app/features/platform/pages/tenant-create/tenant-create-page.component.ts')),
    ).toBe(true);
  });
  it('a random feature file is not carved out', () => {
    expect(ten03Allow(APP).some((r) => r.test('src/app/features/crm/services/crm.service.ts'))).toBe(false);
  });
});

describe('[TEN-04] only core/** decodes the access token', () => {
  it('flags atob(', () => {
    expect(ten04Finder({ path: 'x.ts', content: `const d = atob(payload);` })).toEqual(['call: atob(']);
  });
  it('flags jwtDecode(', () => {
    expect(ten04Finder({ path: 'x.ts', content: `const claims = jwtDecode(token);` })).toEqual(['call: jwtDecode(']);
  });
  it('flags token.split(\'.\')', () => {
    expect(ten04Finder({ path: 'x.ts', content: `const parts = token.split('.');` })).toEqual([`call: token.split('.')`]);
  });
  it('does not flag file.name.split(\'.\') (extension parsing, not a token)', () => {
    expect(ten04Finder({ path: 'x.ts', content: `const ext = file.name.split('.').pop();` })).toEqual([]);
  });
  it('does not flag permissionKey.split(\'.\') (a permission code, not a token)', () => {
    expect(ten04Finder({ path: 'x.ts', content: `const parts = permissionKey.split('.');` })).toEqual([]);
  });
});

describe('[TEN-05] only core and named tenant-scoped stores read .tid', () => {
  it('flags a .tid property-access read', () => {
    expect(ten05Finder({ path: 'x.ts', content: `const t = claims.tid;` })).toEqual(['property access: .tid']);
  });
  it('flags an optional-chained .tid read', () => {
    expect(ten05Finder({ path: 'x.ts', content: `const t = claims?.tid?.trim();` })).toEqual(['property access: .tid']);
  });
  it('does not flag a type-position tid field (chat-state.service.ts identityOf shape)', () => {
    expect(ten05Finder({ path: 'x.ts', content: `function identityOf(c: { tid?: string; sub?: string }): string { return f(c); }` })).toEqual(
      [],
    );
  });
  it('does not flag an unrelated .id read', () => {
    expect(ten05Finder({ path: 'x.ts', content: `const i = claims.id;` })).toEqual([]);
  });
  it('the shell allowlist is a real path match (chat-history.store.ts)', () => {
    expect(ten05Allow(APP).some((r) => r.test('src/app/features/shell/services/chat-history.store.ts'))).toBe(true);
  });
});

describe('[TEN-06] browser storage is classified tenant-scoped or preference', () => {
  const finder = ten06Finder(TEST_PROJECT);

  it('flags an unclassified file that uses localStorage', () => {
    expect(finder({ path: 'src/app/features/crm/services/fxten-new-storage.service.ts', content: `localStorage.setItem('x', '1');` })).toEqual(
      ['unclassified storage user: classify in arch/rules/tenancy.rules.ts (TEN-06)'],
    );
  });
  it('does not flag a file that never touches storage', () => {
    expect(finder({ path: 'src/app/features/crm/services/fxten-plain.service.ts', content: `export const x = 1;` })).toEqual([]);
  });
  it('flags a preference file missing the marker comment', () => {
    expect(finder({ path: 'src/app/core/services/theme.service.ts', content: `localStorage.setItem('t', 'dark');` })).toEqual([
      'preference storage file missing "// arch: non-tenant storage — <reason>" marker',
    ]);
  });
  it('accepts a preference file that carries the marker comment', () => {
    const content = `// arch: non-tenant storage — theme preference (ADR-0065 §6)\nlocalStorage.setItem('t', 'dark');`;
    expect(finder({ path: 'src/app/core/services/theme.service.ts', content })).toEqual([]);
  });
  it('flags a tenant-scoped file missing tid/sub', () => {
    expect(finder({ path: 'src/app/core/services/auth.service.ts', content: `localStorage.setItem('token', accessToken);` })).toEqual([
      'tenant-scoped storage file must reference tid',
      'tenant-scoped storage file must reference sub',
    ]);
  });
  it('accepts a tenant-scoped file that references both tid and sub', () => {
    const content = `const key = claims?.tid + claims?.sub; localStorage.setItem(key, payload);`;
    expect(finder({ path: 'src/app/features/shell/services/chat-history.store.ts', content })).toEqual([]);
  });
});

describe('[TEN-07] storage setItem/JSON.parse must sit inside try', () => {
  it('flags a setItem outside try', () => {
    expect(ten07Finder({ path: 'x.ts', content: `localStorage.setItem('k', 'v');` })).toEqual([
      'setItem not wrapped in try: localStorage.setItem(',
    ]);
  });
  it('accepts a setItem inside try', () => {
    expect(ten07Finder({ path: 'x.ts', content: `try { localStorage.setItem('k', 'v'); } catch {}` })).toEqual([]);
  });
  it('flags JSON.parse of a same-function storage read, outside try', () => {
    const content = `function f() { const raw = localStorage.getItem('k'); return JSON.parse(raw); }`;
    expect(ten07Finder({ path: 'x.ts', content })).toContain('JSON.parse of a storage read not wrapped in try');
  });
  it('accepts JSON.parse of a storage read when wrapped in try', () => {
    const content = `function f() { const raw = localStorage.getItem('k'); try { return JSON.parse(raw); } catch { return null; } }`;
    expect(ten07Finder({ path: 'x.ts', content })).toEqual([]);
  });
  it('does not flag JSON.parse unrelated to storage', () => {
    const content = `function f(v: string) { return JSON.parse(v); }`;
    expect(ten07Finder({ path: 'x.ts', content })).toEqual([]);
  });

  it('inTryBlock is false inside a catch block of the same statement', () => {
    // A node textually "inside" a TryStatement but inside its catch clause must not count.
    const sf = ts.createSourceFile('x.ts', `try {} catch { localStorage.setItem('k','v'); }`, ts.ScriptTarget.Latest, true);
    let call: ts.Node | undefined;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === 'localStorage.setItem') call = n;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(call).toBeDefined();
    expect(inTryBlock(call!)).toBe(false);
  });
});

describe('[TEN-08] no new organizationId field', () => {
  it('flags an organizationId identifier', () => {
    expect(ten08Finder({ path: 'x.ts', content: `const organizationId = x;` })).toEqual(['identifier: organizationId']);
  });
  it('flags an organizationId object-literal key', () => {
    expect(ten08Finder({ path: 'x.ts', content: `const e = { organizationId: id };` })).toContain('property key: organizationId');
  });
  it('ignores a comment mention', () => {
    expect(ten08Finder({ path: 'x.ts', content: `// no new organizationId fields\nconst x = 1;` })).toEqual([]);
  });
});
