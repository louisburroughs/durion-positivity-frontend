import type { PostalCodeEntry, TravelBufferPolicyResponse } from '@durion-sdk/location';
import { TravelBufferType, isTravelBufferType } from './mobile-unit-setup.models';

/** Column limit on `service_area_postal_code.postal_code`; longer values fail the save. */
export const POSTAL_CODE_MAX_LENGTH = 20;

/** Fields `PATCH /v1/service-areas/{id}` reads. It can't rename an area (backend#2256). */
export interface ServiceAreaPatch {
  description?: string;
  active?: boolean;
}

/** Fields `PATCH /v1/travel-buffer-policies/{id}` reads. A policy's name is fixed at create. */
export interface TravelBufferPolicyPatch {
  bufferType?: TravelBufferType;
  /** Null clears the value. */
  bufferValue?: number | null;
  notes?: string;
}

/** The values the service area dialog holds. */
export interface ServiceAreaDraft {
  name: string;
  description: string;
  active: boolean;
  countryCode: string;
  postalCodes: PostalCodeEntry[];
}

/** The values the travel buffer policy dialog holds. Type is empty when the stored one is invalid. */
export interface TravelBufferPolicyDraft {
  name: string;
  bufferType: TravelBufferType | '';
  bufferValue: string;
  notes: string;
}

export interface PostalCodeParse {
  readonly added: PostalCodeEntry[];
  /** Codes already in the list, or repeated in the pasted text. */
  readonly duplicates: number;
  /** Codes over the column limit, left out. */
  readonly tooLong: string[];
}

export function postalCodeKey(entry: PostalCodeEntry): string {
  return `${entry.countryCode.toUpperCase()}|${entry.postalCode}`;
}

export function isCountryCode(value: string): boolean {
  return /^[A-Za-z]{2}$/.test(value.trim());
}

/**
 * Codes pasted one per line or separated by commas or semicolons. Spaces inside a code are kept
 * ("K1A 0B1"): eligibility matches postal codes exactly, so a code is stored as typed, trimmed.
 */
export function parsePostalCodes(
  text: string,
  countryCode: string,
  existing: readonly PostalCodeEntry[],
): PostalCodeParse {
  const country = countryCode.trim().toUpperCase();
  const seen = new Set(existing.map(postalCodeKey));
  const added: PostalCodeEntry[] = [];
  const tooLong: string[] = [];
  let duplicates = 0;
  for (const raw of text.split(/[\n\r,;]+/)) {
    const postalCode = raw.trim().replace(/\s+/g, ' ');
    if (!postalCode) continue;
    if (postalCode.length > POSTAL_CODE_MAX_LENGTH) {
      tooLong.push(postalCode);
      continue;
    }
    const entry = { postalCode, countryCode: country };
    const key = postalCodeKey(entry);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    added.push(entry);
  }
  return { added, duplicates, tooLong };
}

export function samePostalCodes(a: readonly PostalCodeEntry[], b: readonly PostalCodeEntry[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(postalCodeKey));
  return b.every(entry => keys.has(postalCodeKey(entry)));
}

/** A buffer value as typed: a number of 0 or more, blank (no value), or invalid (undefined). */
export function parseBufferValue(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export function policyDraft(policy: TravelBufferPolicyResponse | null): TravelBufferPolicyDraft {
  return {
    name: policy?.name ?? '',
    bufferType: policy && isTravelBufferType(policy.bufferType) ? policy.bufferType : policy ? '' : 'FLAT_MINUTES',
    bufferValue: policy?.bufferValue == null ? '' : String(policy.bufferValue),
    notes: policy?.notes ?? '',
  };
}
