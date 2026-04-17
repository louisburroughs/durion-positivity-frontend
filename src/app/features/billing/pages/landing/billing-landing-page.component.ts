import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'invoiceDetailId'
  | 'paymentCaptureInvoiceId'
  | 'voidRefundInvoiceId'
  | 'voidRefundPaymentId'
  | 'receiptListInvoiceId'
  | 'receiptDetailInvoiceId'
  | 'receiptDetailId';

type PageState = 'ready' | 'loading' | 'error';

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly routePattern: string;
  readonly field: LaunchField;
  readonly inputLabelKey: string;
  readonly inputPlaceholderKey: string;
  readonly field2?: LaunchField;
  readonly input2LabelKey?: string;
  readonly input2PlaceholderKey?: string;
  readonly actionKey: string;
  readonly buildCommands: (value: string, value2?: string) => readonly string[];
}

interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly cards: readonly LaunchCard[];
}

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'BILLING.LANDING.SECTION.INVOICES.TITLE',
    descriptionKey: 'BILLING.LANDING.SECTION.INVOICES.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'BILLING.LANDING.CARD.INVOICE_DETAIL.TITLE',
        descriptionKey: 'BILLING.LANDING.CARD.INVOICE_DETAIL.DESCRIPTION',
        routePattern: 'invoices/:invoiceId',
        field: 'invoiceDetailId',
        inputLabelKey: 'BILLING.LANDING.FIELD.INVOICE_ID',
        inputPlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.INVOICE_ID',
        actionKey: 'BILLING.LANDING.ACTION.OPEN_INVOICE',
        buildCommands: v => ['/app', 'billing', 'invoices', v],
      },
    ],
  },
  {
    titleKey: 'BILLING.LANDING.SECTION.PAYMENTS.TITLE',
    descriptionKey: 'BILLING.LANDING.SECTION.PAYMENTS.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'BILLING.LANDING.CARD.PAYMENT_CAPTURE.TITLE',
        descriptionKey: 'BILLING.LANDING.CARD.PAYMENT_CAPTURE.DESCRIPTION',
        routePattern: 'invoices/:invoiceId/payment-capture',
        field: 'paymentCaptureInvoiceId',
        inputLabelKey: 'BILLING.LANDING.FIELD.INVOICE_ID',
        inputPlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.INVOICE_ID',
        actionKey: 'BILLING.LANDING.ACTION.OPEN_PAYMENT_CAPTURE',
        buildCommands: v => ['/app', 'billing', 'invoices', v, 'payment-capture'],
      },
      {
        kind: 'launch',
        titleKey: 'BILLING.LANDING.CARD.PAYMENT_VOID_REFUND.TITLE',
        descriptionKey: 'BILLING.LANDING.CARD.PAYMENT_VOID_REFUND.DESCRIPTION',
        routePattern: 'invoices/:invoiceId/payments/:paymentId/void-refund',
        field: 'voidRefundInvoiceId',
        inputLabelKey: 'BILLING.LANDING.FIELD.INVOICE_ID',
        inputPlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.INVOICE_ID',
        field2: 'voidRefundPaymentId',
        input2LabelKey: 'BILLING.LANDING.FIELD.PAYMENT_ID',
        input2PlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.PAYMENT_ID',
        actionKey: 'BILLING.LANDING.ACTION.OPEN_VOID_REFUND',
        buildCommands: (v, v2) => ['/app', 'billing', 'invoices', v, 'payments', v2 ?? '', 'void-refund'],
      },
    ],
  },
  {
    titleKey: 'BILLING.LANDING.SECTION.RECEIPTS.TITLE',
    descriptionKey: 'BILLING.LANDING.SECTION.RECEIPTS.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'BILLING.LANDING.CARD.RECEIPT_LIST.TITLE',
        descriptionKey: 'BILLING.LANDING.CARD.RECEIPT_LIST.DESCRIPTION',
        routePattern: 'invoices/:invoiceId/receipts',
        field: 'receiptListInvoiceId',
        inputLabelKey: 'BILLING.LANDING.FIELD.INVOICE_ID',
        inputPlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.INVOICE_ID',
        actionKey: 'BILLING.LANDING.ACTION.OPEN_RECEIPT_LIST',
        buildCommands: v => ['/app', 'billing', 'invoices', v, 'receipts'],
      },
      {
        kind: 'launch',
        titleKey: 'BILLING.LANDING.CARD.RECEIPT_DETAIL.TITLE',
        descriptionKey: 'BILLING.LANDING.CARD.RECEIPT_DETAIL.DESCRIPTION',
        routePattern: 'invoices/:invoiceId/receipts/:receiptId',
        field: 'receiptDetailInvoiceId',
        inputLabelKey: 'BILLING.LANDING.FIELD.INVOICE_ID',
        inputPlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.INVOICE_ID',
        field2: 'receiptDetailId',
        input2LabelKey: 'BILLING.LANDING.FIELD.RECEIPT_ID',
        input2PlaceholderKey: 'BILLING.LANDING.PLACEHOLDER.RECEIPT_ID',
        actionKey: 'BILLING.LANDING.ACTION.OPEN_RECEIPT_DETAIL',
        buildCommands: (v, v2) => ['/app', 'billing', 'invoices', v, 'receipts', v2 ?? ''],
      },
    ],
  },
] as const;

@Component({
  selector: 'app-billing-landing-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './billing-landing-page.component.html',
  styleUrl: './billing-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    invoiceDetailId: '',
    paymentCaptureInvoiceId: '',
    voidRefundInvoiceId: '',
    voidRefundPaymentId: '',
    receiptListInvoiceId: '',
    receiptDetailInvoiceId: '',
    receiptDetailId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;
  readonly totalPageCount = LANDING_SECTIONS.flatMap(s => s.cards).length;

  updateLaunchValue(field: LaunchField, value: string): void {
    this.launchValues.update(prev => ({ ...prev, [field]: value }));
    this.launchErrors.update(prev => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  }

  launchValue(field: LaunchField): string {
    return this.launchValues()[field];
  }

  launchError(field: LaunchField): string | null {
    return this.launchErrors()[field] ?? null;
  }

  async openLaunch(card: LaunchCard): Promise<void> {
    const value = this.launchValues()[card.field].trim();
    const secondaryField = card.field2;
    const value2 = secondaryField ? this.launchValues()[secondaryField].trim() : undefined;

    let hasErrors = false;
    if (!value) {
      this.launchErrors.update(prev => ({
        ...prev,
        [card.field]: 'BILLING.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      hasErrors = true;
    }
    if (secondaryField && !value2) {
      this.launchErrors.update(prev => ({
        ...prev,
        [secondaryField]: 'BILLING.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      hasErrors = true;
    }
    if (hasErrors) return;

    this.launchErrors.update(() => ({}));
    this.errorKey.set(null);
    this.state.set('loading');
    this.activeLaunchField.set(card.field);

    try {
      const navigated = await this.router.navigate([...card.buildCommands(value, value2)]);
      if (!navigated) {
        this.state.set('error');
        this.errorKey.set('BILLING.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('BILLING.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
