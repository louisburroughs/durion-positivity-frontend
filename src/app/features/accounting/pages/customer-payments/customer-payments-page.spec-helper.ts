import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import {
  ApplyResult,
  AutomaticApplication,
  AutomaticApplicationsList,
  MatchLine,
  OpenInvoice,
  OpenInvoicesList,
  ReceivablesTotals,
  RemainderCredit,
  WaitingPayment,
  WaitingPaymentsList,
} from '../../models/customer-payments.models';
import { CustomerPaymentsService } from '../../services/customer-payments.service';
import { toIsoDate } from '../../utils/date-window.util';
import { CUSTOMER_PAYMENTS_CLOCK } from './customer-payments-page.component';

/**
 * Shared fixtures for the Customer payments page and match-panel specs.
 * "Today" is the injected clock; every date derives from it (ADR-0038 §7).
 * Excluded from the app build (`*.spec-helper.ts`).
 */
export const NOW = new Date(2026, 9, 6, 10, 30);
export const TODAY_ISO = toIsoDate(NOW);
const daysAgo = (days: number): string => toIsoDate(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days));

export const ALL_PAYMENT_PERMISSIONS = [
  'accounting:payment:apply',
  'accounting:payment:reverse',
  'accounting:customer-credit:refund',
  'reporting:view:financial-statements',
];

export const invoice = (overrides: Partial<OpenInvoice> = {}): OpenInvoice => ({
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-2026-01701',
  documentDate: daysAgo(40),
  dueDate: daysAgo(10),
  overdue: true,
  balanceDue: 250,
  currency: 'USD',
  ...overrides,
});

/** Two suggested invoices adding up exactly to the payment (S1 rule C). */
export const payment = (overrides: Partial<WaitingPayment> = {}): WaitingPayment => ({
  paymentId: 'pay-1',
  customerId: 'cust-1',
  customerName: 'Harbor Fleet Services',
  customerReference: 'C-1042',
  sourceInvoiceId: null,
  sourceInvoiceNumber: null,
  method: 'CARD',
  receivedAt: NOW.toISOString(),
  totalAmount: 600,
  unappliedAmount: 600,
  currency: 'USD',
  reasons: ['SAME_CUSTOMER', 'EXACT_TOTAL'],
  suggestedInvoices: [
    { invoiceId: 'inv-1', invoiceNumber: 'INV-2026-01701', balanceDue: 250, suggestedAmount: 250 },
    { invoiceId: 'inv-2', invoiceNumber: 'INV-2026-01702', balanceDue: 350, suggestedAmount: 350 },
  ],
  suggestedTotal: 600,
  leftOver: 0,
  ...overrides,
});

export const openInvoices = (items: OpenInvoice[] = defaultInvoices(), truncated = false): OpenInvoicesList => ({
  items,
  truncated,
});

export function defaultInvoices(): OpenInvoice[] {
  return [
    invoice(),
    invoice({ invoiceId: 'inv-2', invoiceNumber: 'INV-2026-01702', balanceDue: 350, overdue: false, dueDate: daysAgo(-5) }),
    invoice({ invoiceId: 'inv-3', invoiceNumber: 'INV-2026-01710', balanceDue: 900, overdue: false, dueDate: daysAgo(-20) }),
  ];
}

export const waitingList = (items: WaitingPayment[] = [payment()], overrides: Partial<WaitingPaymentsList> = {}): WaitingPaymentsList => ({
  items,
  waitingCount: items.length,
  totalUnapplied: items.reduce((sum, item) => sum + item.unappliedAmount, 0),
  currency: 'USD',
  asOf: NOW.toISOString(),
  truncated: false,
  ...overrides,
});

export const automaticRow = (overrides: Partial<AutomaticApplication> = {}): AutomaticApplication => ({
  applicationId: 'app-1',
  paymentId: 'pay-7',
  invoiceNumber: 'INV-2026-01690',
  customerName: 'Ana Ruiz',
  customerReference: null,
  appliedAmount: 120.5,
  currency: 'USD',
  appliedAt: NOW.toISOString(),
  reversed: false,
  reversedAt: null,
  undoOffered: true,
  ...overrides,
});

export const automaticList = (items: AutomaticApplication[] = [automaticRow()]): AutomaticApplicationsList => ({
  items,
  truncated: false,
});

export const receivablesTotals: ReceivablesTotals = {
  asOfDate: TODAY_ISO,
  generatedAt: NOW.toISOString(),
  totalOutstanding: 18240.5,
  overdue: 7240.25,
};

export const applyResult = (overrides: Partial<ApplyResult> = {}): ApplyResult => ({
  appliedAmount: 600,
  remainingAmount: 0,
  currency: 'USD',
  lines: [
    { invoiceId: 'inv-1', appliedAmount: 250, balanceAfter: 0 },
    { invoiceId: 'inv-2', appliedAmount: 350, balanceAfter: 0 },
  ],
  creditAmount: null,
  ...overrides,
});

export const remainderCredit: RemainderCredit = { creditId: 'credit-1', amount: 100, currency: 'USD' };

export interface PaymentsMocks {
  readonly held: WritableSignal<readonly string[] | null>;
  readonly claims: WritableSignal<JwtClaims | null>;
  readonly queryParams: BehaviorSubject<Record<string, string>>;
  readonly service: {
    waitingPayments: ReturnType<typeof vi.fn<() => Observable<WaitingPaymentsList>>>;
    openInvoices: ReturnType<typeof vi.fn<(customerId: string) => Observable<OpenInvoicesList>>>;
    automaticApplications: ReturnType<typeof vi.fn<(since: string) => Observable<AutomaticApplicationsList>>>;
    applyPayment: ReturnType<
      typeof vi.fn<(paymentId: string, key: string, lines: readonly MatchLine[]) => Observable<ApplyResult>>
    >;
    creditRemainder: ReturnType<
      typeof vi.fn<(paymentId: string, expected: number, requestId: string) => Observable<RemainderCredit>>
    >;
    refundCredit: ReturnType<typeof vi.fn<(creditId: string, amount: number, requestId: string) => Observable<number | null>>>;
    reverseApplication: ReturnType<typeof vi.fn<(applicationId: string, reason: string) => Observable<void>>>;
    receivablesTotals: ReturnType<typeof vi.fn<(asOf: string) => Observable<ReceivablesTotals>>>;
  };
}

export function createPaymentsMocks(held: readonly string[] | null = ALL_PAYMENT_PERMISSIONS): PaymentsMocks {
  return {
    held: signal(held),
    claims: signal<JwtClaims | null>(null),
    queryParams: new BehaviorSubject<Record<string, string>>({}),
    service: {
      waitingPayments: vi.fn(() => of(waitingList())),
      openInvoices: vi.fn(() => of(openInvoices())),
      automaticApplications: vi.fn(() => of(automaticList())),
      applyPayment: vi.fn(() => of(applyResult())),
      creditRemainder: vi.fn(() => of(remainderCredit)),
      refundCredit: vi.fn(() => of<number | null>(100)),
      reverseApplication: vi.fn(() => of(undefined)),
      receivablesTotals: vi.fn(() => of(receivablesTotals)),
    },
  };
}

/** `authExtras` carries the tenant signal: tenant ids stay in spec files (arch rule TEN-02). */
export function configurePayments(
  mocks: PaymentsMocks,
  authExtras: Partial<AuthService>,
  clock: () => Date = () => new Date(NOW.getTime()),
): void {
  const auth: Partial<AuthService> = {
    ...authExtras,
    currentUserClaims: mocks.claims,
    permissionsKnown: (() => mocks.held() !== null) as AuthService['permissionsKnown'],
    hasAnyRole: () => false,
    hasPermission: (code: string) => !!mocks.held()?.includes(code),
    hasAnyPermission: (codes: readonly string[]) => {
      const held = mocks.held();
      return !!held && codes.some(code => held.includes(code));
    },
  };
  const route: Partial<ActivatedRoute> = {
    queryParamMap: new Observable(subscriber =>
      mocks.queryParams.subscribe(params => subscriber.next(convertToParamMap(params))),
    ),
  };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: route },
      { provide: AuthService, useValue: auth },
      { provide: CustomerPaymentsService, useValue: mocks.service },
      { provide: CUSTOMER_PAYMENTS_CLOCK, useValue: clock },
    ],
  });
}

/** A read the test resolves by hand (ADR-0063 §8: ordering tests drive a Subject, never `of`). */
export function pending<T>(): Subject<T> {
  return new Subject<T>();
}
