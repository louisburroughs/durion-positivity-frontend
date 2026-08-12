/**
 * Sign classification for vendor-delivered monetary amounts (issue #192).
 *
 * Pure functions. Deliberately **no arithmetic**.
 *
 * ── Why these take strings and never numbers ────────────────────────────────
 * A payable amount is a decimal the backend computed. Parsing it into a JS
 * `number` to classify it would introduce a binary float where an exact decimal
 * arrived, and every later render would be a re-derivation of a value this
 * client is not allowed to re-derive (#192 §5: "no client conversion or
 * recomputation"). So the amount travels as the exact string the backend sent,
 * is rendered verbatim, and these helpers only *read the sign character* to
 * decide how to present it.
 *
 * ── The sign convention, chosen once ────────────────────────────────────────
 * Accounting renders negatives either as `(1,240.50)` or as `-1,240.50`. Both
 * are conventional; only one of them can be produced without rewriting the
 * delivered text. The parenthesis form requires stripping the minus sign and
 * re-wrapping the digits — a transformation on a number this client must not
 * transform, and one that silently loses the sign if the backend ever ships a
 * trailing-minus or accounting-parenthesised string of its own. **The minus
 * convention is therefore the convention here, everywhere**: the amount is
 * printed exactly as delivered, so a credit note that arrives as `-1240.50`
 * renders as `-1240.50` and can never be coerced positive by this code, because
 * this code never rewrites it.
 *
 * The negative-ness is additionally announced in text (a translated "credit"
 * cue) rather than by colour or typography alone (ADR-0029 / ADR-0039).
 */

/** Sign of an amount, read from its text rather than computed. */
export type SupplierAmountSign = 'positive' | 'negative' | 'zero';

/** Any digit other than zero — the test for "this string carries magnitude". */
const NON_ZERO_DIGIT = /[1-9]/;

/**
 * Classify a delivered amount string.
 *
 * `-0.00` is `zero`, not `negative`: a signed zero is still nothing owed, and
 * flagging it as a credit would put a "credit note" cue on a line worth nothing.
 * A missing or unparseable value is `zero` as well — the caller renders the
 * placeholder, and no sign cue is attached to an absent amount.
 */
export function amountSign(amount: string | null | undefined): SupplierAmountSign {
  if (typeof amount !== 'string') {
    return 'zero';
  }
  const trimmed = amount.trim();
  if (trimmed === '' || !NON_ZERO_DIGIT.test(trimmed)) {
    return 'zero';
  }
  return trimmed.startsWith('-') || trimmed.startsWith('−') ? 'negative' : 'positive';
}

/** True when the delivered amount reduces what is payable. */
export function isNegativeAmount(amount: string | null | undefined): boolean {
  return amountSign(amount) === 'negative';
}

/**
 * The amount as it will be rendered — which is the amount as it was delivered.
 *
 * This function exists so the "render verbatim" rule has one place a test can
 * point at, not because there is any transformation to perform. It trims
 * surrounding whitespace and nothing else; an absent amount becomes `null` so
 * the template can choose a placeholder instead of printing "null".
 */
export function displayAmount(amount: string | null | undefined): string | null {
  if (typeof amount !== 'string') {
    return null;
  }
  const trimmed = amount.trim();
  return trimmed === '' ? null : trimmed;
}
