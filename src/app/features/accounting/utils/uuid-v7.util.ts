/**
 * A UUIDv7 (RFC 9562 §5.7): a 48-bit Unix-millisecond timestamp, the version
 * and variant bits, and 74 random bits. Bank-reconciliation writes carry one
 * as `requestId`, the idempotency key the backend dedupes a retried request
 * on (SPEC-manual-bank-reconciliation §6.3).
 */
export function uuidV7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let time = Math.max(0, Math.floor(now));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
