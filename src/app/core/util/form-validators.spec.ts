/**
 * `notBlank`/`integerAtLeast` regression tests (#212).
 *
 * These validators exist alongside `Validators.required`/`Validators.min`,
 * not instead of them — `notBlank` catches the whitespace-only value that
 * `required` alone lets through, and `integerAtLeast` passes a null/empty
 * value so it can be paired with `required` when the field itself is
 * mandatory.
 */
import { describe, expect, it } from 'vitest';
import { FormControl } from '@angular/forms';
import { integerAtLeast, notBlank, tenantSlug } from './form-validators';

describe('notBlank', () => {
  it.each(['', '   ', '\t'])('rejects %j with a blank error', value => {
    const control = new FormControl(value);

    expect(notBlank(control)).toEqual({ blank: true });
  });

  it('accepts a non-whitespace string', () => {
    const control = new FormControl('x');

    expect(notBlank(control)).toBeNull();
  });

  it('accepts null — pairs with Validators.required for mandatory fields', () => {
    const control = new FormControl<string | null>(null);

    expect(notBlank(control)).toBeNull();
  });
});

describe('integerAtLeast(1)', () => {
  const validator = integerAtLeast(1);

  it.each([0, -1, 1.5])('rejects %j with an integerMin error', value => {
    const control = new FormControl<number | null>(value);

    expect(validator(control)).toEqual({ integerMin: { min: 1 } });
  });

  it.each([1, 42])('accepts %j', value => {
    const control = new FormControl<number | null>(value);

    expect(validator(control)).toBeNull();
  });

  it('accepts null — pairs with Validators.required when the field is mandatory', () => {
    const control = new FormControl<number | null>(null);

    expect(validator(control)).toBeNull();
  });

  it('accepts undefined', () => {
    const control = new FormControl<number | null>(undefined as unknown as number | null);

    expect(validator(control)).toBeNull();
  });
});

describe('tenantSlug', () => {
  it.each(['acme-tire', ' Acme-Tire ', 'a1b', 'x'.repeat(63)])('accepts %j once normalized', value => {
    expect(tenantSlug(new FormControl<string | null>(value))).toBeNull();
  });

  it.each(['ab', '-acme', 'acme-', 'acme tire', 'acme.tire', 'x'.repeat(64)])('rejects %j', value => {
    expect(tenantSlug(new FormControl<string | null>(value))).toEqual({ tenantSlug: true });
  });

  it('accepts an empty or null value — pair with Validators.required when mandatory', () => {
    expect(tenantSlug(new FormControl<string | null>(''))).toBeNull();
    expect(tenantSlug(new FormControl<string | null>('   '))).toBeNull();
    expect(tenantSlug(new FormControl<string | null>(null))).toBeNull();
  });
});
