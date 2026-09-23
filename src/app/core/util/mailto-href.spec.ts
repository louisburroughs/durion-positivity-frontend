/**
 * `safeMailtoHref` regression tests (#304, #306).
 *
 * The register's first fix stopped only the literal separators; the percent-encoded forms
 * got through, so the encoded cases below are the load-bearing ones.
 */
import { describe, expect, it } from 'vitest';
import { safeMailtoHref } from './mailto-href';

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
