import { PERMISSION_BY_BIT, PERMISSION_CATALOG_VERSION } from './permission-catalog';

/**
 * permission-bits.ts
 * ------------------
 * Decoder for the JWT `perm_bits` claim (ADR-0040).
 *
 * Wire format, mirroring the backend's `PermissionBitsetCodec`:
 *   Base64URL (unpadded) of `java.util.BitSet#toByteArray()`, i.e. bit `n`
 *   lives in byte `n >>> 3` at little-endian bit position `n & 7`.
 *
 * The bit index → permission code mapping is vendored in `permission-catalog.ts`.
 * Backend bit indexes are permanent and never reassigned, so a token encoded
 * under a newer catalog version still decodes correctly for every code this
 * catalog knows; bits beyond it are skipped, exactly as the backend decoder
 * skips bits it has no mapping for.
 */

/** Decodes an unpadded Base64URL string into bytes. Returns null if malformed. */
function decodeBase64Url(encoded: string): Uint8Array | null {
  const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Decodes a `perm_bits` claim into the set of permission codes it grants.
 *
 * An empty or blank claim decodes to an empty set — that is a token that
 * genuinely grants no permissions, not a missing claim. Callers must
 * distinguish "claim absent" (permissions unknown) from "claim empty"
 * before treating the result as authoritative; see `AuthService`.
 *
 * @param permBits Base64URL-encoded bitset from the token, or null/undefined.
 * @returns the granted permission codes; empty when the claim is blank or malformed.
 */
export function decodePermissionBits(permBits: string | null | undefined): Set<string> {
  const granted = new Set<string>();
  if (!permBits || !permBits.trim()) return granted;

  const bytes = decodeBase64Url(permBits.trim());
  if (!bytes) {
    console.warn('[permissions] Malformed perm_bits claim — treating as no permissions.');
    return granted;
  }

  const decodableBits = Math.min(bytes.length * 8, PERMISSION_BY_BIT.length);
  for (let bit = 0; bit < decodableBits; bit += 1) {
    if ((bytes[bit >>> 3] & (1 << (bit & 7))) !== 0) {
      granted.add(PERMISSION_BY_BIT[bit]);
    }
  }

  return granted;
}

/**
 * Encodes permission codes back into the `perm_bits` wire format.
 * Used by tests and by the mock-auth session; the real claim is issued by the
 * backend and only ever decoded here.
 */
export function encodePermissionBits(codes: Iterable<string>): string {
  const indexes: number[] = [];
  for (const code of codes) {
    const bit = PERMISSION_BY_BIT.indexOf(code);
    if (bit >= 0) indexes.push(bit);
  }
  if (!indexes.length) return '';

  const bytes = new Uint8Array((Math.max(...indexes) >>> 3) + 1);
  for (const bit of indexes) {
    bytes[bit >>> 3] |= 1 << (bit & 7);
  }

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * True when a token's `perm_ver` is newer than the catalog vendored here.
 * Decoding stays correct (indexes are permanent) but codes added after
 * {@link PERMISSION_CATALOG_VERSION} are invisible to this build, so routes
 * gated on them would deny a user who actually holds them.
 */
export function isCatalogStale(permVer: number | undefined): boolean {
  return typeof permVer === 'number' && permVer > PERMISSION_CATALOG_VERSION;
}
