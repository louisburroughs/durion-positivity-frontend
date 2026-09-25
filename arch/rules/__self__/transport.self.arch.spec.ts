import { FIXTURES } from '../../support/projects';
import { deepSdkImportFinder, sdk01, sdk02, sdk03, sdk04, sdk05, sdk06, sdk07, sdk08, sdk09, sdk10, sdk11 } from '../transport.rules';

/**
 * Self-tests for transport.rules.ts (plan §6): each rule factory runs against the FIXTURES project
 * and is shown to fire on a planted violation, and to stay quiet on the matching compliant/false-
 * positive shape. Uses toContain/not.toContain, never exact equality (other agents plant fixtures in
 * the same tree concurrently).
 *
 * Expected keys are built from `FIXTURES.app` directly: `Project.app` is `root`-relative (see
 * `support/projects.ts`), the same path space ArchUnitTS's own `FileInfo.path` uses.
 */
const FX = FIXTURES;
const A = `${FX.app}/features/fxlay-a`;
const CORE = `${FX.app}/core`;

describe('[SDK-01] HttpClient/HttpBackend allowlist', () => {
  it('fires on a service importing HttpClient outside the allowlist', async () => {
    const keys = await sdk01(FIXTURES).keys();
    expect(keys).toContain(`${A}/services/fxlay-sdk01-violate.service.ts :: 'HttpClient'`);
  });
  it('allows HttpErrorResponse/HttpParams anywhere, and HttpClient in the allowlisted files', async () => {
    const keys = await sdk01(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/services/fxlay-sdk01-compliant.service.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${FX.app}/app.config.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${CORE}/services/api-base.service.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${CORE}/interceptors/`))).toBe(false);
  });
});

describe('[SDK-02] pages/**/components/** must not depend on ApiBaseService', () => {
  it('fires when a page depends on ApiBaseService', async () => {
    const keys = await sdk02(FIXTURES).keys();
    expect(keys).toContain(`${A}/pages/fxlay-sdk02-violate.page.ts -> ${CORE}/services/api-base.service.ts`);
  });
  it('stays quiet on a page with no ApiBaseService dependency', async () => {
    const keys = await sdk02(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/pages/fxlay-a.page.ts`))).toBe(false);
  });
});

describe('[SDK-03] frozen ApiBaseService importer list', () => {
  it('fires on a new file depending on ApiBaseService', async () => {
    const keys = await sdk03(FIXTURES).keys();
    expect(keys).toContain(`${A}/services/fxlay-sdk03-violate.service.ts -> ${CORE}/services/api-base.service.ts`);
  });
  it('stays quiet on a file with no ApiBaseService dependency', async () => {
    const keys = await sdk03(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/services/fxlay-a.service.ts`))).toBe(false);
  });
});

describe('[SDK-04] no fetch(/XMLHttpRequest/new EventSource(', () => {
  it('fires on fetch(, new XMLHttpRequest( and new EventSource(', async () => {
    const keys = await sdk04(FIXTURES).keys();
    expect(keys).toContain(`${A}/services/fxlay-sdk04-violate.service.ts :: fetch(`);
    expect(keys).toContain(`${A}/services/fxlay-sdk04-violate.service.ts :: new XMLHttpRequest(`);
    expect(keys).toContain(`${A}/services/fxlay-sdk04-violate.service.ts :: new EventSource(`);
  });
  it('stays quiet on a file with no raw transport calls', async () => {
    const keys = await sdk04(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/services/fxlay-sdk04-compliant.service.ts`))).toBe(false);
  });
});

describe('[SDK-05] no hardcoded backend paths', () => {
  it('fires on both backend-path shapes', async () => {
    const keys = await sdk05(FIXTURES).keys();
    expect(keys).toContain(`${A}/services/fxlay-sdk05-violate.service.ts :: '/billing/v1/invoices'`);
    expect(keys).toContain(`${A}/services/fxlay-sdk05-violate.service.ts :: '/v1/billing/accounts'`);
  });
  it('stays quiet on a look-alike literal, a non-matching literal and a comment mention', async () => {
    const keys = await sdk05(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/services/fxlay-sdk05-compliant.service.ts`))).toBe(false);
  });
  it('allows app.config.ts and api-base.service.ts', async () => {
    const keys = await sdk05(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${FX.app}/app.config.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${CORE}/services/api-base.service.ts`))).toBe(false);
  });
});

describe('[SDK-06] environment.apiBaseUrl allowlist', () => {
  it('fires on a feature file reading environment.apiBaseUrl', async () => {
    const keys = await sdk06(FIXTURES).keys();
    expect(keys).toContain(`${A}/fxlay-sdk06-violate.ts :: 'apiBaseUrl'`);
  });
  it('stays quiet on a different environment property, and on the allowlisted files', async () => {
    const keys = await sdk06(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/fxlay-sdk06-compliant.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${FX.app}/app.config.ts`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`${CORE}/services/api-base.service.ts`))).toBe(false);
  });
});

describe('[SDK-07] no absolute http(s):// literals', () => {
  it('fires on an absolute https:// literal', async () => {
    const keys = await sdk07(FIXTURES).keys();
    expect(keys).toContain(`${A}/fxlay-sdk07-violate.ts :: 'https://example.com/api'`);
  });
  it('stays quiet on a relative literal', async () => {
    const keys = await sdk07(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/fxlay-sdk07-compliant.ts`))).toBe(false);
  });
});

describe('[SDK-08] @durion-sdk/* is imported from the package root only', () => {
  it('fires on a deep @durion-sdk/x/… import', async () => {
    const keys = await sdk08(FIXTURES).keys();
    expect(keys).toContain(`${A}/fxlay-sdk08-violate.ts :: '@durion-sdk/accounting/deep/path'`);
  });
  it('stays quiet on a package-root @durion-sdk/x import', async () => {
    const keys = await sdk08(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/fxlay-sdk08-compliant.ts`))).toBe(false);
  });
  it('allows the /configuration entry point only in app.config.ts', () => {
    const src = `import { Configuration } from '@durion-sdk/accounting/configuration';`;
    expect(deepSdkImportFinder({ path: 'src/app/app.config.ts', content: src })).toEqual([]);
    expect(deepSdkImportFinder({ path: 'src/app/features/x/services/x.service.ts', content: src })).toEqual([
      `'@durion-sdk/accounting/configuration'`,
    ]);
    expect(deepSdkImportFinder({ path: 'src/app/features/x/app.config.ts', content: src })).toEqual([
      `'@durion-sdk/accounting/configuration'`,
    ]);
    expect(
      deepSdkImportFinder({ path: 'src/app/app.config.ts', content: `import { X } from '@durion-sdk/accounting/other';` }),
    ).toEqual([`'@durion-sdk/accounting/other'`]);
  });
});

describe('[SDK-09] pages/**/components/** should not inject @durion-sdk/* directly (warn)', () => {
  it('reports a page importing @durion-sdk/* (warn: never throws)', async () => {
    const keys = await sdk09(FIXTURES).keys();
    expect(keys).toContain(`${A}/pages/fxlay-sdk09-violate.page.ts :: '@durion-sdk/accounting'`);
  });
});

describe('[SDK-10] @durion-sdk/tenant only under features/platform/**', () => {
  it('fires when a non-platform feature imports @durion-sdk/tenant', async () => {
    const keys = await sdk10(FIXTURES).keys();
    expect(keys).toContain(`${A}/fxlay-sdk10-violate.ts :: '@durion-sdk/tenant'`);
  });
  it('allows features/platform/** to import @durion-sdk/tenant', async () => {
    const keys = await sdk10(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${FX.app}/features/platform/`))).toBe(false);
  });
});

describe('[SDK-11] no window.location.origin', () => {
  it('fires on window.location.origin', async () => {
    const keys = await sdk11(FIXTURES).keys();
    expect(keys).toContain(`${A}/fxlay-sdk11-violate.ts :: 'window.location.origin'`);
  });
  it('stays quiet on a configured base URL', async () => {
    const keys = await sdk11(FIXTURES).keys();
    expect(keys.some((k) => k.startsWith(`${A}/fxlay-sdk11-compliant.ts`))).toBe(false);
  });
});
