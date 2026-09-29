import { describe, expect, it } from 'vitest';
import { uuidV7 } from './uuid-v7.util';

describe('uuidV7', () => {
  it('is a version-7, RFC 9562 variant UUID', () => {
    expect(uuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('carries the millisecond timestamp in its first 48 bits', () => {
    const now = Date.UTC(2026, 8, 29, 12, 0, 0);
    const hex = uuidV7(now).replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(now);
  });

  it('differs between two calls in the same millisecond', () => {
    expect(uuidV7(1)).not.toBe(uuidV7(1));
  });
});
