/** A file's bytes as standard base64, for a JSON body's `content` field. */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) overflows the call stack on a large file.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * A keyed amount as a number, accepting a comma as the decimal separator
 * (fr/es locales) and ignoring spaces used for grouping. Returns null for
 * anything that is not a plain, finite decimal number; the server stays the judge of
 * precision (AMOUNT_PRECISION_EXCEEDS_CURRENCY).
 */
export function parseAmountInput(value: string): number | null {
  let text = value.replace(/[\s\u00a0\u202f]/g, '');
  if (text.includes(',') && !text.includes('.')) text = text.replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  // An oversized literal becomes Infinity, which JSON would send as null.
  return Number.isFinite(amount) ? amount : null;
}
