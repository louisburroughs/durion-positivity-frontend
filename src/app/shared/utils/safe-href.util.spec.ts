/**
 * `safeMailtoHref` regression tests (#304, #306).
 *
 * The register's first fix stopped only the literal separators; the percent-encoded forms
 * got through, so the encoded cases below are the load-bearing ones.
 */
import { describe, expect, it } from 'vitest';
import { isSafeHref, safeMailtoHref } from './safe-href.util';

describe('safeMailtoHref', () => {
  it('builds a mailto target from a plain address', () => {
    expect(safeMailtoHref('renee.albright@durion.internal')).toBe('mailto:renee.albright@durion.internal');
    expect(safeMailtoHref('first.last+tag@sub.example.co')).toBe('mailto:first.last+tag@sub.example.co');
  });

  it('returns null for an absent or shapeless value', () => {
    expect(safeMailtoHref(null)).toBeNull();
    expect(safeMailtoHref(undefined)).toBeNull();
    expect(safeMailtoHref('')).toBeNull();
    expect(safeMailtoHref('not-an-email')).toBeNull();
    expect(safeMailtoHref('a@b')).toBeNull();
  });

  it('refuses header injection, a smuggled recipient and control characters', () => {
    expect(safeMailtoHref('a@b.com?bcc=attacker@evil.example')).toBeNull();
    expect(safeMailtoHref('a@b.com&bcc=attacker@evil.example')).toBeNull();
    expect(safeMailtoHref('a@b.com,attacker@evil.example')).toBeNull();
    expect(safeMailtoHref('a@b.com;attacker@evil.example')).toBeNull();
    expect(safeMailtoHref('a@b.com\r\nbcc:attacker@evil.example')).toBeNull();
    expect(safeMailtoHref('java\tscript:alert(1)')).toBeNull();
    expect(safeMailtoHref(' a@b.com')).toBeNull();
  });

  it('refuses percent-encoded separators, not only literal ones', () => {
    expect(safeMailtoHref('a@b.com%0d%0abcc=attacker%40evil.example')).toBeNull();
    expect(safeMailtoHref('a@b.com%3Fbcc=attacker@evil.example')).toBeNull();
    expect(safeMailtoHref('a%40b.com')).toBeNull();
    expect(safeMailtoHref('a@b.com%26cc=x@y.example')).toBeNull();
  });
});

describe('isSafeHref', () => {
  it('accepts http, mailto and scheme-less targets', () => {
    for (const href of [
      'https://durion.example',
      'http://durion.example',
      'mailto:ops@durion.example',
      '/app/people',
      '#top',
      'people/42',
    ]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it('rejects script-bearing and empty targets', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox',
      '  ',
    ]) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });

  it('rejects an origin-relative target that only looks like a path', () => {
    // `//host/path` carries no scheme but resolves to another origin, so a
    // scheme check alone used to wave it through as an in-app link.
    for (const href of ['//evil.example/login', '\\\\evil.example\\share', '//evil.example']) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });

  it('sees through whitespace and control characters smuggled into a scheme', () => {
    // Browsers strip these before resolving, so `java\tscript:` would have run.
    expect(isSafeHref('java\tscript:alert(1)')).toBe(false);
    expect(isSafeHref('java\nscript:alert(1)')).toBe(false);
    expect(isSafeHref('\u0001javascript:alert(1)')).toBe(false);
  });
});
