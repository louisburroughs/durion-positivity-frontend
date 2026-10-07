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
  return Number.isFinite(value) && value > 0 ? value : null;
}
