/**
 * Locale resolution for manufacturer-published text (issue #195).
 *
 * Pure functions — no Angular, no HTTP.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Manufacturer marketing text is **vendor data**, not UI copy, so it does not go
 * through ngx-translate: there is no key to add to a locale file, and the vendor
 * decides which locales it publishes. What it does need is the *same* fallback
 * behaviour the platform already applies to UI locales, so a fr-CA user does not
 * silently get an empty description when the vendor only published `fr-FR`.
 *
 * The ladder mirrors `LocaleService.normalizeLocale()`:
 *   1. exact tag match, case-insensitive (`fr-CA` → `fr-CA`)
 *   2. same primary language, any region (`fr-CA` → `fr-FR`)
 *   3. the platform default locale (`en-US`), by the same two steps
 *   4. the first entry the vendor published
 *   5. `null` — the vendor published nothing usable
 *
 * Step 4 is deliberate: showing manufacturer content in *some* language beats
 * showing an empty panel, because the reader can still see the imagery and
 * recognise the product. Step 5 is what makes "no content" representable, which
 * is what lets the caller render nothing rather than an empty section.
 */
import { SupplierLocalizedText } from '../models/supplier-enrichment.models';

/** Platform default locale, matching `LocaleService`'s own default. */
export const ENRICHMENT_DEFAULT_LOCALE = 'en-US';

function primaryLanguage(tag: string): string {
  return tag.split('-')[0]?.toLowerCase() ?? '';
}

function usable(entry: SupplierLocalizedText | undefined): boolean {
  return !!entry && typeof entry.value === 'string' && entry.value.trim() !== '';
}

function matchLocale(
  entries: readonly SupplierLocalizedText[],
  locale: string,
): SupplierLocalizedText | null {
  const wanted = locale.toLowerCase();
  const exact = entries.find(entry => entry.locale?.toLowerCase() === wanted && usable(entry));
  if (exact) {
    return exact;
  }

  const language = primaryLanguage(locale);
  if (!language) {
    return null;
  }
  return (
    entries.find(entry => primaryLanguage(entry.locale ?? '') === language && usable(entry)) ?? null
  );
}

/**
 * Resolve one localized entry for the requested locale, applying the fallback
 * ladder above. Returns `null` when nothing usable was published.
 */
export function resolveLocalizedEntry(
  entries: readonly SupplierLocalizedText[] | null | undefined,
  locale: string,
): SupplierLocalizedText | null {
  if (!entries || entries.length === 0) {
    return null;
  }

  const requested = matchLocale(entries, locale);
  if (requested) {
    return requested;
  }

  const fallback = matchLocale(entries, ENRICHMENT_DEFAULT_LOCALE);
  if (fallback) {
    return fallback;
  }

  return entries.find(entry => usable(entry)) ?? null;
}

/** Resolved text for the requested locale, or `null` when nothing was published. */
export function resolveLocalizedText(
  entries: readonly SupplierLocalizedText[] | null | undefined,
  locale: string,
): string | null {
  return resolveLocalizedEntry(entries, locale)?.value.trim() ?? null;
}

/**
 * True when the resolved entry is not in the requested locale.
 *
 * The caller uses this to mark manufacturer content with its actual language, so
 * a reader is never left guessing why a French screen shows English prose.
 */
export function isLocaleFallback(
  entries: readonly SupplierLocalizedText[] | null | undefined,
  locale: string,
): boolean {
  const resolved = resolveLocalizedEntry(entries, locale);
  if (!resolved) {
    return false;
  }
  return resolved.locale?.toLowerCase() !== locale.toLowerCase();
}
