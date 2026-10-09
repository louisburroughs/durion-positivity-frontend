import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { RemitToGroup } from './vendor-form';

/** One remit-to field: its control name, label key, autocomplete token and server field path. */
interface RemitField {
  readonly name: keyof RemitToGroup['controls'];
  readonly label: string;
  readonly autocomplete: string;
  readonly type: 'text' | 'email';
}

const FIELDS: readonly RemitField[] = [
  { name: 'payeeName', label: 'POSITIVITY.VENDORS.REMIT.FIELD.PAYEE', autocomplete: 'off', type: 'text' },
  { name: 'addressLine1', label: 'POSITIVITY.VENDORS.REMIT.FIELD.LINE1', autocomplete: 'off', type: 'text' },
  { name: 'addressLine2', label: 'POSITIVITY.VENDORS.REMIT.FIELD.LINE2', autocomplete: 'off', type: 'text' },
  { name: 'city', label: 'POSITIVITY.VENDORS.REMIT.FIELD.CITY', autocomplete: 'off', type: 'text' },
  { name: 'region', label: 'POSITIVITY.VENDORS.REMIT.FIELD.REGION', autocomplete: 'off', type: 'text' },
  { name: 'postalCode', label: 'POSITIVITY.VENDORS.REMIT.FIELD.POSTAL_CODE', autocomplete: 'off', type: 'text' },
  { name: 'countryCode', label: 'POSITIVITY.VENDORS.REMIT.FIELD.COUNTRY', autocomplete: 'off', type: 'text' },
  { name: 'remittanceEmail', label: 'POSITIVITY.VENDORS.REMIT.FIELD.EMAIL', autocomplete: 'off', type: 'email' },
];

/**
 * The remit-to address fields (payee, two lines, city, region, postal code,
 * country, remittance email) for Add vendor and the remit-to change dialog.
 * A postal address only: no bank account field exists here (OI-14).
 */
@Component({
  selector: 'app-vendor-remit-to-fields',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './vendor-remit-to-fields.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-remit-to-fields.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorRemitToFieldsComponent {
  readonly group = input.required<RemitToGroup>();
  readonly idPrefix = input.required<string>();
  /** Server field errors keyed by payload path (`remitTo.city`, …). */
  readonly fieldErrors = input<Readonly<Record<string, string>>>({});

  readonly fields = FIELDS;

  error(name: string): string | null {
    return this.fieldErrors()[`remitTo.${name}`] ?? null;
  }
}
