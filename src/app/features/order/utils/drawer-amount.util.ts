import { getNumberOfCurrencyDigits } from '@angular/common';

/**
 * A typed amount, as the positive number the backend takes, or null when it is blank, not a
 * plain positive amount, or carries more decimals than the currency has (ADR-0067 PC-14 F-4: the
 * exponent comes from the currency, never a fixed two). A decimal comma is accepted as well as a
 * point. The UI never rounds or computes money (P7, F-7): the text is read as typed.
 */
export function parseAmount(text: string, currencyCode: string): number | null {
  const trimmed = text.trim();
  const digits = getNumberOfCurrencyDigits(currencyCode);
  const pattern = digits > 0 ? new RegExp(`^\\d+([.,]\\d{1,${digits}})?$`) : /^\d+$/;
  if (!pattern.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  // The number sent must be exactly the amount typed: refuse one a double cannot carry, rather
  // than let 9999999999999999 go out as 10000000000000000 (F-7: the UI never rounds money).
  return String(value) === canonical(trimmed) ? value : null;
}

/** The typed decimal without leading zeros, trailing fraction zeros or a decimal comma. */
function canonical(typed: string): string {
  const [whole, fraction = ''] = typed.split(/[.,]/);
  const digits = whole.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals ? `${digits}.${decimals}` : digits;
}
