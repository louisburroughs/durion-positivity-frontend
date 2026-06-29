import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { RecordHit, RecordSearchMap } from '../../../../shared/landing/landing.models';
import { InvoiceFinderItem } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { BILLING_LANDING_CONFIG } from './billing-landing.config';

@Component({
  selector: 'app-billing-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" [searchFns]="searchFns" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingLandingPageComponent {
  private readonly transport = inject(BillingTransportService);

  readonly config = BILLING_LANDING_CONFIG;

  /** InvoiceFinderItem is RecordHit-compatible (id/primary/secondary/tertiary). */
  private readonly invoiceSearch = (q: string): Observable<RecordHit[]> =>
    this.transport.searchInvoices(q) as Observable<InvoiceFinderItem[]>;

  readonly searchFns: RecordSearchMap = {
    invoice: this.invoiceSearch,
  };
}
