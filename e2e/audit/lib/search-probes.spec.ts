import { afterEach, describe, expect, it } from 'vitest';
import { listEnv } from './config';
import { APP_SEEDS } from './route-seeds';
import { isSearchFor, SEARCH_PROBE_PATHS } from './search-probes';

describe('search probes', () => {
  it('probes only landing pages the crawl already seeds', () => {
    for (const path of SEARCH_PROBE_PATHS) expect(APP_SEEDS).toContain(path);
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

  it('returns an empty list for a blank value so the feature can be disabled', () => {
    process.env[NAME] = '';
    expect(listEnv(NAME, ['an'])).toEqual([]);
  });
});
