/**
 * Locale fallback for manufacturer-published text (issue #195).
 *
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { describe, expect, it } from 'vitest';
import { SupplierLocalizedText } from '../models/supplier-enrichment.models';
import {
  ENRICHMENT_DEFAULT_LOCALE,
  isLocaleFallback,
  resolveLocalizedEntry,
  resolveLocalizedText,
} from './enrichment-locale.util';

const multi: SupplierLocalizedText[] = [
  { locale: 'en-US', value: 'All-season touring tread' },
  { locale: 'fr-FR', value: 'Bande de roulement toutes saisons' },
  { locale: 'es-US', value: 'Banda de rodadura para todas las estaciones' },
];

describe('enrichment-locale.util', () => {
  it('resolves an exact locale match', () => {
    expect(resolveLocalizedText(multi, 'es-US')).toBe(
      'Banda de rodadura para todas las estaciones',
    );
    expect(isLocaleFallback(multi, 'es-US')).toBe(false);
  });

  it('matches an exact tag case-insensitively', () => {
    expect(resolveLocalizedEntry(multi, 'ES-us')?.locale).toBe('es-US');
  });

  it('falls back to the same primary language in another region (fr-CA → fr-FR)', () => {
    expect(resolveLocalizedText(multi, 'fr-CA')).toBe('Bande de roulement toutes saisons');
    expect(isLocaleFallback(multi, 'fr-CA')).toBe(true);
  });

  it('falls back to the platform default locale when the language is absent', () => {
    expect(resolveLocalizedText(multi, 'de-DE')).toBe('All-season touring tread');
    expect(resolveLocalizedEntry(multi, 'de-DE')?.locale).toBe(ENRICHMENT_DEFAULT_LOCALE);
  });

  it('falls back to the first published entry when even the default locale is absent', () => {
    const noDefault: SupplierLocalizedText[] = [
      { locale: 'it-IT', value: 'Battistrada quattro stagioni' },
    ];

    expect(resolveLocalizedText(noDefault, 'en-US')).toBe('Battistrada quattro stagioni');
    expect(isLocaleFallback(noDefault, 'en-US')).toBe(true);
  });

  it('returns null when nothing was published — absence stays representable', () => {
    expect(resolveLocalizedText([], 'en-US')).toBeNull();
    expect(resolveLocalizedText(null, 'en-US')).toBeNull();
    expect(resolveLocalizedText(undefined, 'en-US')).toBeNull();
    expect(isLocaleFallback([], 'en-US')).toBe(false);
  });

  it('skips blank values rather than resolving to empty prose', () => {
    const blanked: SupplierLocalizedText[] = [
      { locale: 'fr-CA', value: '   ' },
      { locale: 'en-US', value: 'Touring tread' },
    ];

    expect(resolveLocalizedText(blanked, 'fr-CA')).toBe('Touring tread');
  });

  it('returns null when every published entry is blank', () => {
    const blanked: SupplierLocalizedText[] = [
      { locale: 'fr-CA', value: '' },
      { locale: 'en-US', value: '  ' },
    ];

    expect(resolveLocalizedText(blanked, 'fr-CA')).toBeNull();
  });

  it('trims surrounding whitespace from vendor text', () => {
    const padded: SupplierLocalizedText[] = [{ locale: 'en-US', value: '  Touring tread  ' }];

    expect(resolveLocalizedText(padded, 'en-US')).toBe('Touring tread');
  });
});
