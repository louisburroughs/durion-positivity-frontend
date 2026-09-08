import { describe, expect, it, vi } from 'vitest';

import { decodePermissionBits, encodePermissionBits, isCatalogStale } from './permission-bits';
import { PERMISSION_BY_BIT, PERMISSION_CATALOG_VERSION } from './permission-catalog';

describe('permission-bits', () => {
  describe('catalog', () => {
    it('has contiguous, unique permission codes', () => {
      expect(PERMISSION_BY_BIT.length).toBeGreaterThan(0);
      expect(new Set(PERMISSION_BY_BIT).size).toBe(PERMISSION_BY_BIT.length);
      expect(PERMISSION_BY_BIT.every(code => typeof code === 'string' && code.length > 0)).toBe(true);
    });
  });

  describe('decodePermissionBits', () => {
    it('decodes bit 0 from the backend wire format', () => {
      // Java BitSet{0}.toByteArray() === [0x01] → Base64URL "AQ"
      expect(decodePermissionBits('AQ')).toEqual(new Set([PERMISSION_BY_BIT[0]]));
    });

    it('reads bits little-endian within each byte, matching java.util.BitSet', () => {
      // BitSet{1, 8} → bytes [0x02, 0x01] → Base64URL "AgE"
      expect(decodePermissionBits('AgE')).toEqual(
        new Set([PERMISSION_BY_BIT[1], PERMISSION_BY_BIT[8]]),
      );
    });

    it('accepts padded Base64URL as well as unpadded', () => {
      expect(decodePermissionBits('AQ==')).toEqual(decodePermissionBits('AQ'));
    });

    it('decodes the URL-safe alphabet', () => {
      // Byte 0xFF sets bits 0-7; "_w" is the URL-safe encoding of [0xFF].
      expect(decodePermissionBits('_w')).toEqual(new Set(PERMISSION_BY_BIT.slice(0, 8)));
    });

    it('returns an empty set for an empty or blank claim', () => {
      expect(decodePermissionBits('')).toEqual(new Set());
      expect(decodePermissionBits('   ')).toEqual(new Set());
      expect(decodePermissionBits(null)).toEqual(new Set());
      expect(decodePermissionBits(undefined)).toEqual(new Set());
    });

    it('returns an empty set for a malformed claim rather than throwing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(decodePermissionBits('not base64!!')).toEqual(new Set());
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('ignores bits beyond the bundled catalog instead of failing', () => {
      // A token from a newer catalog sets bits this build has no mapping for.
      const beyond = PERMISSION_BY_BIT.length + 32;
      const bytes = new Uint8Array((beyond >>> 3) + 1);
      bytes[0] |= 1; // bit 0 — known
      bytes[beyond >>> 3] |= 1 << (beyond & 7); // unknown
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

      expect(decodePermissionBits(encoded)).toEqual(new Set([PERMISSION_BY_BIT[0]]));
    });
  });

  describe('encodePermissionBits', () => {
    it('round-trips through decode', () => {
      const codes = [
        PERMISSION_BY_BIT[0],
        PERMISSION_BY_BIT[7],
        PERMISSION_BY_BIT[64],
        PERMISSION_BY_BIT[PERMISSION_BY_BIT.length - 1],
      ];
      expect(decodePermissionBits(encodePermissionBits(codes))).toEqual(new Set(codes));
    });

    it('encodes bit 0 to the same wire format the backend emits', () => {
      expect(encodePermissionBits([PERMISSION_BY_BIT[0]])).toBe('AQ');
    });

    it('encodes an empty grant as an empty string', () => {
      expect(encodePermissionBits([])).toBe('');
    });

    it('skips codes that are not in the catalog', () => {
      expect(encodePermissionBits(['not:a:permission'])).toBe('');
    });
  });

  describe('isCatalogStale', () => {
    it('is false for the bundled version and for older tokens', () => {
      expect(isCatalogStale(PERMISSION_CATALOG_VERSION)).toBe(false);
      expect(isCatalogStale(PERMISSION_CATALOG_VERSION - 1)).toBe(false);
      expect(isCatalogStale(undefined)).toBe(false);
    });

    it('is true when the token was encoded against a newer catalog', () => {
      expect(isCatalogStale(PERMISSION_CATALOG_VERSION + 1)).toBe(true);
    });
  });
});
