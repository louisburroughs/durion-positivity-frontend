import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { switchMap } from 'rxjs/operators';
import { VENDOR_NET_DAYS_MAX, VENDOR_NET_DAYS_MIN } from '../../models/supplier-vendor.models';
import { TAX_NUMBER_MAX, TaxRegistrationGroup, VendorFieldsGroup, numberNeeded, taxRegistrationGroup } from './vendor-form';

/**
 * The vendor fields Add vendor and Edit share (CAP:550 S30, #469 items 3, 5):
 * legal and display names, repeatable tax registrations, payment terms and
 * currency. The parent owns the form group, the submit and the server errors.
 *
 * A tax-registration number is RESTRICTED (ADR-0072): a stored registration
 * shows only "•••• 1234" or "on file", and its number input starts empty; the
 * field is `autocomplete="off"` and is never echoed anywhere else.
 */
@Component({
  selector: 'app-vendor-fields',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './vendor-fields.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-fields.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorFieldsComponent {
  readonly group = input.required<VendorFieldsGroup>();
  /** Prefix for element ids, unique per form on the page. */
  readonly idPrefix = input.required<string>();
  /** Server field errors (payload path → translated key). */
  readonly fieldErrors = input<Readonly<Record<string, string>>>({});
  /** Shown once a submit was attempted: client hints on untouched fields. */
  readonly submitted = input(false);

  readonly netMin = VENDOR_NET_DAYS_MIN;
  readonly netMax = VENDOR_NET_DAYS_MAX;
  readonly taxNumberMax = TAX_NUMBER_MAX;
  /** Bumped on every value change, so OnPush templates re-read the reactive form. */
  readonly revision = signal(0);

  constructor() {
    toObservable(this.group)
      .pipe(
        switchMap(group => group.valueChanges),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.revision.update(value => value + 1));
  }

  id(suffix: string): string {
    return `${this.idPrefix()}-${suffix}`;
  }

  serverError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  showRequired(name: 'legalName' | 'displayName' | 'currency'): boolean {
    this.revision();
    const control = this.group().controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  showNetDays(): boolean {
    this.revision();
    const group = this.group();
    return group.hasError('netDays') && (group.controls.netDays.touched || this.submitted());
  }

  isNet(): boolean {
    this.revision();
    return this.group().controls.termsKind.value === 'NET';
  }

  rows(): TaxRegistrationGroup[] {
    this.revision();
    return this.group().controls.taxRegistrations.controls;
  }

  stored(row: TaxRegistrationGroup): boolean {
    return row.controls.registrationId.value !== '';
  }

  needsNumber(row: TaxRegistrationGroup): boolean {
    this.revision();
    return numberNeeded(row);
  }

  showSchemeRequired(row: TaxRegistrationGroup): boolean {
    this.revision();
    const scheme = row.controls.scheme;
    return scheme.invalid && (scheme.touched || this.submitted());
  }

  showNumberRequired(row: TaxRegistrationGroup): boolean {
    this.revision();
    return row.hasError('numberRequired') && (row.controls.number.touched || this.submitted());
  }

  addRegistration(): void {
    this.group().controls.taxRegistrations.push(taxRegistrationGroup());
  }

  removeRegistration(index: number): void {
    this.group().controls.taxRegistrations.removeAt(index);
  }
}
