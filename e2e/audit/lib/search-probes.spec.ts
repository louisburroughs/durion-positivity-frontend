import { afterEach, describe, expect, it } from 'vitest';
import { listEnv, searchTermsFromEnv } from './config';
import { APP_SEEDS } from './route-seeds';
import type { Page } from '@playwright/test';
import { isSearchFor, probeSearch, SEARCH_PROBE_PATHS } from './search-probes';

describe('search probes', () => {
  it('probes only landing pages the crawl already seeds', () => {
    for (const path of SEARCH_PROBE_PATHS) expect(APP_SEEDS).toContain(path);
  });

  it('skips /app/people, whose finder rows carry a bare id no template accepts', () => {
    expect(SEARCH_PROBE_PATHS).not.toContain('/app/people');
  });

  it('matches a search endpoint carrying the term as q', () => {
    expect(isSearchFor('https://durionpos.org/api/workorder/v1/workorders/search?q=an&page=0&size=10', 'an')).toBe(true);
  });

  it('matches a list endpoint carrying the term under another param name', () => {
    expect(isSearchFor('https://durionpos.org/api/people-contact/v1/people?search=an', 'an')).toBe(true);
  });

  it('ignores requests whose query only contains the term as a substring', () => {
    expect(isSearchFor('https://durionpos.org/api/crm/v1/parties/search?q=anna', 'an')).toBe(false);
  });

  it('ignores non-API and malformed urls', () => {
    expect(isSearchFor('https://durionpos.org/assets/i18n/en-US.json?q=an', 'an')).toBe(false);
    expect(isSearchFor('not a url', 'an')).toBe(false);
  });
});

describe('searchTermsFromEnv', () => {
  afterEach(() => {
    delete process.env['AUDIT_SEARCH_TERMS'];
  });

  it('drops terms shorter than the finder minimum, which would never be sent', () => {
    process.env['AUDIT_SEARCH_TERMS'] = 'a,an,e,er';
    expect(searchTermsFromEnv()).toEqual(['an', 'er']);
  });

  it('defaults to a single two-character term', () => {
    expect(searchTermsFromEnv()).toEqual(['an']);
  });
});

describe('listEnv', () => {
  const NAME = 'AUDIT_TEST_LIST_ENV';
  afterEach(() => {
    delete process.env[NAME];
  });

  it('falls back when unset', () => {
    expect(listEnv(NAME, ['an'])).toEqual(['an']);
  });

  it('splits and trims a comma-separated value', () => {
    process.env[NAME] = ' an, er ,,';
    expect(listEnv(NAME, ['x'])).toEqual(['an', 'er']);
  });

  it('drops duplicate terms, keeping first-seen order', () => {
    process.env[NAME] = 'an,er, an,er';
    expect(listEnv(NAME, ['x'])).toEqual(['an', 'er']);
  });

  it('returns an empty list for a blank value so the feature can be disabled', () => {
    process.env[NAME] = '';
    expect(listEnv(NAME, ['an'])).toEqual([]);
  });
});

/**
 * A Page fake just wide enough for probeSearch: each finder answers a typed term
 * with a 200, a 500, or nothing at all, and every call the probe makes on a finder
 * is recorded so "types, clears, never selects or submits" is checkable.
 */
type FinderBehaviour = 'ok' | 'error' | 'silent';

function fakePage(finders: FinderBehaviour[], options: { gotoFails?: boolean } = {}) {
  const calls: string[] = [];
  const bodiesAwaited: string[] = [];
  const waiters: Array<{ predicate: (res: unknown) => boolean; resolve: (res: unknown) => void }> = [];
  const respond = (term: string, status: number) => {
    const res = {
      request: () => ({ method: () => 'GET' }),
      url: () => `https://durionpos.org/api/workorder/v1/workorders/search?q=${encodeURIComponent(term)}`,
      ok: () => status < 400,
      finished: async () => {
        bodiesAwaited.push(term);
        return null;
      },
    };
    for (const waiter of [...waiters]) {
      if (waiter.predicate(res)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(res);
      }
    }
  };
  const page = {
    goto: async () => {
      if (options.gotoFails) throw new Error('net::ERR_CONNECTION_RESET');
      return null;
    },
    waitForLoadState: async () => undefined,
    waitForResponse: (predicate: (res: unknown) => boolean, opts: { timeout: number }) =>
      new Promise((resolve, reject) => {
        waiters.push({ predicate, resolve });
        setTimeout(() => reject(new Error('Timeout')), opts.timeout);
      }),
    locator: () => ({
      count: async () => finders.length,
      nth: (index: number) => ({
        fill: async (value: string) => {
          calls.push(`finder${index}.fill(${value})`);
          if (value === '') return;
          const behaviour = finders[index];
          if (behaviour === 'ok') respond(value, 200);
          if (behaviour === 'error') respond(value, 500);
        },
      }),
    }),
  };
  return { page: page as unknown as Page, calls, bodiesAwaited };
}

describe('probeSearch', () => {
  const FAST = { responseTimeoutMs: 20 };

  it('types every term into every finder and counts each answered search', async () => {
    const { page, calls } = fakePage(['ok', 'ok']);
    const result = await probeSearch(page, '/app/workexec', ['an', 'er'], FAST);

    expect(result).toEqual({ path: '/app/workexec', finders: 2, responses: 4 });
    // Types, then clears; the fake has no click/press/selectOption, so any attempt
    // to select a result or submit would throw rather than pass silently.
    expect(calls).toEqual([
      'finder0.fill(an)',
      'finder0.fill(er)',
      'finder0.fill()',
      'finder1.fill(an)',
      'finder1.fill(er)',
      'finder1.fill()',
    ]);
  });

  it('waits for each answered body before moving on, so navigation cannot cancel the harvest', async () => {
    const { page, bodiesAwaited } = fakePage(['ok', 'ok']);
    await probeSearch(page, '/app/workexec', ['an', 'er'], FAST);

    expect(bodiesAwaited).toEqual(['an', 'er', 'an', 'er']);
  });

  it('does not count a failed search, nor one that never answers', async () => {
    const { page } = fakePage(['ok', 'error', 'silent']);
    const result = await probeSearch(page, '/app/billing', ['an'], FAST);

    expect(result).toEqual({ path: '/app/billing', finders: 3, responses: 1 });
  });

  it('reports a page that does not load as having no finders', async () => {
    const { page, calls } = fakePage(['ok'], { gotoFails: true });
    const result = await probeSearch(page, '/app/crm', ['an'], FAST);

    expect(result).toEqual({ path: '/app/crm', finders: 0, responses: 0 });
    expect(calls).toEqual([]);
  });
});
