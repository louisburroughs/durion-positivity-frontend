/**
 * Typed reactive-form model shared by Add vendor and the detail page's Edit
 * (CAP:550 S30, #469 items 3 and 5), and by the remit-to change dialog.
 *
 * The client only hints (P7): required fields and lengths block a submit, while
 * the server decides terms validity, currency, number format and uniqueness.
 *
 * Tax registrations (#2621): a stored registration is kept by sending its
 * `registrationId` without a number. Its number is never pre-filled — the form
 * holds only the masked `last4` for display. Changing the scheme or region of a
 * stored registration needs the number typed again; a new registration needs it.
 */
import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import {
  RemitToInput,
  TaxRegistration,
  TaxRegistrationInput,
  VENDOR_NET_DAYS_MAX,
  VENDOR_NET_DAYS_MIN,
  Vendor,
} from '../../models/supplier-vendor.models';
import { formatPaymentTerms, parsePaymentTerms } from '../../utils/supplier-vendor.util';

export const TAX_NUMBER_MAX = 64;
export const VENDOR_NUMBER_MAX = 30;

export type TermsKind = 'DUE_ON_RECEIPT' | 'NET';

export type TaxRegistrationGroup = FormGroup<{
  /** Empty for a new registration. */
  registrationId: FormControl<string>;
  scheme: FormControl<string>;
  region: FormControl<string>;
  /** Typed only; never pre-filled from a read. */
  number: FormControl<string>;
  /** Masked display of a stored registration; not sent. */
  last4: FormControl<string>;
  /** The stored scheme and region, to tell when the number must be typed again; not sent. */
  storedScheme: FormControl<string>;
  storedRegion: FormControl<string>;
}>;

export type RemitToGroup = FormGroup<{
  payeeName: FormControl<string>;
  addressLine1: FormControl<string>;
  addressLine2: FormControl<string>;
  city: FormControl<string>;
  region: FormControl<string>;
  postalCode: FormControl<string>;
  countryCode: FormControl<string>;
  remittanceEmail: FormControl<string>;
}>;

export type VendorFieldsGroup = FormGroup<{
  legalName: FormControl<string>;
  displayName: FormControl<string>;
  taxRegistrations: FormArray<TaxRegistrationGroup>;
  termsKind: FormControl<TermsKind>;
  netDays: FormControl<number | null>;
  currency: FormControl<string>;
}>;

const text = (value = ''): FormControl<string> => new FormControl(value, { nonNullable: true });

/** A stored registration's number is needed again when its scheme or region changed. */
export function numberNeeded(group: TaxRegistrationGroup): boolean {
  const { registrationId, scheme, region, storedScheme, storedRegion } = group.getRawValue();
  if (!registrationId) return true;
  return scheme.trim() !== storedScheme.trim() || region.trim() !== storedRegion.trim();
}

const numberRequiredWhenNeeded: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const group = control as TaxRegistrationGroup;
  return numberNeeded(group) && !group.controls.number.value.trim() ? { numberRequired: true } : null;
};

export function taxRegistrationGroup(stored?: TaxRegistration): TaxRegistrationGroup {
  return new FormGroup(
    {
      registrationId: text(stored?.registrationId ?? ''),
      scheme: new FormControl(stored?.scheme ?? '', { nonNullable: true, validators: [Validators.required] }),
      region: text(stored?.region ?? ''),
      number: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(TAX_NUMBER_MAX)] }),
      last4: text(stored?.last4 ?? ''),
      storedScheme: text(stored?.scheme ?? ''),
      storedRegion: text(stored?.region ?? ''),
    },
    { validators: [numberRequiredWhenNeeded] },
  );
}

const netDaysWhenNet: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const group = control as VendorFieldsGroup;
  if (group.controls.termsKind.value !== 'NET') return null;
  const days = group.controls.netDays.value;
  return days !== null && Number.isInteger(days) && days >= VENDOR_NET_DAYS_MIN && days <= VENDOR_NET_DAYS_MAX
    ? null
    : { netDays: true };
};

export function vendorFieldsGroup(vendor?: Vendor): VendorFieldsGroup {
  const terms = parsePaymentTerms(vendor?.paymentTerms);
  return new FormGroup(
    {
      legalName: new FormControl(vendor?.legalName ?? '', { nonNullable: true, validators: [Validators.required] }),
      displayName: new FormControl(vendor?.displayName ?? '', { nonNullable: true, validators: [Validators.required] }),
      taxRegistrations: new FormArray<TaxRegistrationGroup>((vendor?.taxRegistrations ?? []).map(stored => taxRegistrationGroup(stored))),
      termsKind: new FormControl<TermsKind>(terms?.kind ?? 'DUE_ON_RECEIPT', { nonNullable: true }),
      netDays: new FormControl<number | null>(terms?.kind === 'NET' ? terms.days : 30),
      currency: new FormControl(vendor?.currency ?? '', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: [netDaysWhenNet] },
  );
}

export function remitToGroup(): RemitToGroup {
  return new FormGroup({
    payeeName: text(),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    region: text(),
    postalCode: text(),
    countryCode: text(),
    remittanceEmail: text(),
  });
}

/** The payment terms the form names, in wire form. */
export function termsOf(group: VendorFieldsGroup): string {
  const { termsKind, netDays } = group.getRawValue();
  return termsKind === 'NET' ? formatPaymentTerms({ kind: 'NET', days: netDays ?? 0 }) : formatPaymentTerms({ kind: 'DUE_ON_RECEIPT' });
}

/** Registrations as S23 takes them: a kept one carries `registrationId` and no number. */
export function registrationsOf(group: VendorFieldsGroup): TaxRegistrationInput[] {
  return group.controls.taxRegistrations.controls.map(row => {
    const { registrationId, scheme, region, number } = row.getRawValue();
    const typed = number.trim();
    return {
      registrationId: registrationId || undefined,
      scheme: scheme.trim(),
      region: region.trim() || undefined,
      number: typed || undefined,
    };
  });
}

/** Every remit-to field, trimmed, for `compactRemitTo`. */
export function remitToValues(group: RemitToGroup): Readonly<Record<keyof RemitToInput, string>> {
  return group.getRawValue();
}
