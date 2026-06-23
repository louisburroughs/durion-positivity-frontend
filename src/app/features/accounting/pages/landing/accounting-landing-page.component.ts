import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'eventId'
  | 'ruleSetId'
  | 'creditMemoId'
  | 'vendorPaymentId'
  | 'invoicePaymentId';

type PageState = 'ready' | 'loading' | 'error';

interface DirectCard {
  readonly kind: 'direct';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly route: string;
  readonly actionKey: string;
}

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly field: LaunchField;
  readonly inputLabelKey: string;
  readonly inputPlaceholderKey: string;
  readonly actionKey: string;
  readonly buildCommands: (value: string) => readonly string[];
}

interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly cards: readonly (DirectCard | LaunchCard)[];
}

const INGESTION_DIRECT_CARDS: readonly DirectCard[] = [
  {
    kind: 'direct',
    titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS.DESCRIPTION',
    route: '/app/accounting/events',
    actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS_CONTRACT.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS_CONTRACT.DESCRIPTION',
    route: '/app/accounting/events/contract',
    actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS_SUBMIT.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS_SUBMIT.DESCRIPTION',
    route: '/app/accounting/events/submit',
    actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS_FAILED.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS_FAILED.DESCRIPTION',
    route: '/app/accounting/events/failed',
    actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
  },
] as const;

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'ACCOUNTING.LANDING.SECTION.INGESTION.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.SECTION.INGESTION.DESCRIPTION',
    cards: [
      ...INGESTION_DIRECT_CARDS,
      {
        kind: 'launch',
        titleKey: 'ACCOUNTING.LANDING.CARD.EVENT_DETAIL.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENT_DETAIL.DESCRIPTION',
        field: 'eventId',
        inputLabelKey: 'ACCOUNTING.LANDING.FIELD.EVENT_ID',
        inputPlaceholderKey: 'ACCOUNTING.LANDING.PLACEHOLDER.EVENT_ID',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_EVENT',
        buildCommands: (value: string) => ['/app', 'accounting', 'events', value],
      },
    ],
  },
  {
    titleKey: 'ACCOUNTING.LANDING.SECTION.POSTING_RULES.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.SECTION.POSTING_RULES.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_LIST.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_LIST.DESCRIPTION',
        route: '/app/accounting/posting-rules',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_DETAIL.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_DETAIL.DESCRIPTION',
        field: 'ruleSetId',
        inputLabelKey: 'ACCOUNTING.LANDING.FIELD.RULE_SET_ID',
        inputPlaceholderKey: 'ACCOUNTING.LANDING.PLACEHOLDER.RULE_SET_ID',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_RULE_SET',
        buildCommands: (value: string) => ['/app', 'accounting', 'posting-rules', value],
      },
    ],
  },
  {
    titleKey: 'ACCOUNTING.LANDING.SECTION.PAYMENTS.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.SECTION.PAYMENTS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.PAYMENT_APPLY.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.PAYMENT_APPLY.DESCRIPTION',
        route: '/app/accounting/payments/apply',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS.DESCRIPTION',
        route: '/app/accounting/vendor-payments',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS_NEW.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS_NEW.DESCRIPTION',
        route: '/app/accounting/vendor-payments/new',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENT_DETAIL.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENT_DETAIL.DESCRIPTION',
        field: 'vendorPaymentId',
        inputLabelKey: 'ACCOUNTING.LANDING.FIELD.VENDOR_PAYMENT_ID',
        inputPlaceholderKey: 'ACCOUNTING.LANDING.PLACEHOLDER.VENDOR_PAYMENT_ID',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_VENDOR_PAYMENT',
        buildCommands: (value: string) => ['/app', 'accounting', 'vendor-payments', value],
      },
      {
        kind: 'launch',
        titleKey: 'ACCOUNTING.LANDING.CARD.INVOICE_PAYMENT_STATUS.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.INVOICE_PAYMENT_STATUS.DESCRIPTION',
        field: 'invoicePaymentId',
        inputLabelKey: 'ACCOUNTING.LANDING.FIELD.INVOICE_ID',
        inputPlaceholderKey: 'ACCOUNTING.LANDING.PLACEHOLDER.INVOICE_ID',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_INVOICE_STATUS',
        buildCommands: (value: string) => ['/app', 'accounting', 'invoices', value, 'payment-status'],
      },
    ],
  },
  {
    titleKey: 'ACCOUNTING.LANDING.SECTION.REPORTS.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.SECTION.REPORTS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.LABOR_OVERHEAD.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.LABOR_OVERHEAD.DESCRIPTION',
        route: '/app/accounting/reports/labor-overhead',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'ACCOUNTING.LANDING.SECTION.CREDIT_MEMOS.TITLE',
    descriptionKey: 'ACCOUNTING.LANDING.SECTION.CREDIT_MEMOS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_LIST.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_LIST.DESCRIPTION',
        route: '/app/accounting/credit-memos',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_NEW.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_NEW.DESCRIPTION',
        route: '/app/accounting/credit-memos/new',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMO_DETAIL.TITLE',
        descriptionKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMO_DETAIL.DESCRIPTION',
        field: 'creditMemoId',
        inputLabelKey: 'ACCOUNTING.LANDING.FIELD.CREDIT_MEMO_ID',
        inputPlaceholderKey: 'ACCOUNTING.LANDING.PLACEHOLDER.CREDIT_MEMO_ID',
        actionKey: 'ACCOUNTING.LANDING.ACTION.OPEN_CREDIT_MEMO',
        buildCommands: (value: string) => ['/app', 'accounting', 'credit-memos', value],
      },
    ],
  },
] as const;

@Component({
  selector: 'app-accounting-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './accounting-landing-page.component.html',
  styleUrl: './accounting-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    eventId: '',
    ruleSetId: '',
    creditMemoId: '',
    vendorPaymentId: '',
    invoicePaymentId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;
  /** Route for the primary hero CTA – Ingestion Events list */
  readonly heroEventsRoute = INGESTION_DIRECT_CARDS[0].route;
  /** Route for the secondary hero CTA – Posting Rules list */
  readonly heroPostingRulesRoute = '/app/accounting/posting-rules';

  readonly directLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(
    c => c.kind === 'direct',
  ).length;
  readonly guidedLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(
    c => c.kind === 'launch',
  ).length;
  readonly totalPageCount = this.directLinkCount + this.guidedLinkCount;

  isLaunchCard(card: DirectCard | LaunchCard): card is LaunchCard {
    return card.kind === 'launch';
  }

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
    if (!value) {
      this.launchErrors.update(prev => ({
        ...prev,
        [card.field]: 'ACCOUNTING.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      return;
    }

    this.launchErrors.update(prev => {
      const { [card.field]: _cleared, ...rest } = prev;
      return rest;
    });
    this.errorKey.set(null);
    this.state.set('loading');
    this.activeLaunchField.set(card.field);

    try {
      const navigated = await this.router.navigate(card.buildCommands(value));
      if (!navigated) {
        this.state.set('error');
        this.errorKey.set('ACCOUNTING.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
