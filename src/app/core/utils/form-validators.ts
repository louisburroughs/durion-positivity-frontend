import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isTenantSlug, normalizeTenantSlug } from '../security/tenant';

/**
 * Shared reactive-form validators (#212).
 *
 * `Validators.required` never trims: a whitespace-only string satisfies it,
 * so a control that is only ever consumed after `.trim()` (an id typed into
 * a text field, say) can submit an empty value the caller believed was
 * validated. These validators close that gap without replacing
 * `Validators.required`/`Validators.min` — use them alongside those, not
 * instead of them.
 */

/** Fails a string control whose value is empty or entirely whitespace. */
export function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  const value = control.value;
  return typeof value === 'string' && value.trim().length === 0 ? { blank: true } : null;
}

/**
 * Fails a numeric control whose value is set but is not a whole number of at
 * least `min`. A `null`/`undefined` value passes — pair with
 * `Validators.required` when the field itself is mandatory.
 */
export function integerAtLeast(min: number): ValidatorFn {
  return (control: AbstractControl<number | null>): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || (value as unknown as string) === '') {
      return null;
    }
    return Number.isInteger(value) && value >= min ? null : { integerMin: { min } };
  };
}

/**
 * Fails a string control whose value, once normalized the way it will be sent
 * (`normalizeTenantSlug`), is not a well-formed tenant slug. An empty value
 * passes — pair with `Validators.required` when the slug is mandatory, as it
 * is when registering a tenant but not on the login form.
 */
export function tenantSlug(control: AbstractControl<string | null>): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string') return null;
  const normalized = normalizeTenantSlug(value);
  return normalized === '' || isTenantSlug(normalized) ? null : { tenantSlug: true };
}
