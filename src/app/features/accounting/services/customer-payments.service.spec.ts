import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgedReceivablesReport,
  AutomaticPaymentApplicationRowSourceEnum,
  AutomaticPaymentApplicationsPage,
  CustomerCreditTransactionResponse,
  CustomerCreditsService as CustomerCreditsSdk,
  CustomerOpenInvoicesPage,
  FinancialReportingService as FinancialReportingSdk,
  PaymentApplicationResponse,
  PaymentApplicationsService as PaymentApplicationsSdk,
  RemainderCreditResponse,
  UnappliedPaymentsPage,
} from '@durion-sdk/accounting';
import {
  ApplyResult,
  AutomaticApplicationsList,
  OpenInvoicesList,
  ReceivablesTotals,
  RemainderCredit,
  WaitingPaymentsList,
} from '../models/customer-payments.models';
import {
  AUTOMATIC_PAGE_SIZE,
  CustomerPaymentsService,
  MAX_LIST_PAGES,
  OPEN_INVOICES_PAGE_SIZE,
  PAYMENTS_PAGE_SIZE,
} from './customer-payments.service';

const unappliedPage = (page: number, totalPages: number): UnappliedPaymentsPage => ({
  items: [
    {
      paymentId: `pay-${page}`,
      customerId: 'cust-1',
      customerDisplayName: ' Harbor Fleet Services ',
      customerReference: 'C-1042',
      paymentMethod: 'CARD',
      receivedAt: '2026-10-05T14:00:00Z',
      sourceInvoiceId: 'inv-9',
      sourceInvoiceNumber: 'INV-2026-01702',
      totalAmount: 4615,
      unappliedAmount: 4615,
      currency: 'USD',
      suggestion: {
        invoices: [{ invoiceId: 'inv-9', invoiceNumber: 'INV-2026-01702', balanceDue: 4615, suggestedAmount: 4615 }],
        reasons: ['REMITTANCE_REFERENCE', 'SAME_CUSTOMER', 'EXACT_TOTAL'],
        suggestedTotal: 4615,
        leftOver: 0,
      },
    },
  ],
  page,
  size: PAYMENTS_PAGE_SIZE,
  totalElements: totalPages,
  totalPages,
  summary: { asOf: '2026-10-06T10:00:00Z', count: totalPages, currency: 'USD', totalUnappliedAmount: 4615 * totalPages },
});

const openInvoicesPage: CustomerOpenInvoicesPage = {
  items: [
    {
      invoiceId: 'inv-9',
      invoiceNumber: 'INV-2026-01702',
      arStatus: 'OPEN',
      balanceDue: 4615,
      currency: 'USD',
      daysOverdue: 3,
      documentDate: '2026-09-01',
      dueDate: '2026-10-01',
      overdue: true,
      total: 4615,
      workorderId: 'wo-1',
    },
  ],
  page: 0,
  size: OPEN_INVOICES_PAGE_SIZE,
  totalElements: 1,
  totalPages: 1,
  summary: {
    asOf: '2026-10-06T10:00:00Z',
    count: 1,
    currency: 'USD',
    overdueBalanceDue: 4615,
    overdueCount: 1,
    totalBalanceDue: 4615,
  },
};

const automaticPage: AutomaticPaymentApplicationsPage = {
  items: [
    {
      paymentApplicationId: 'app-1',
      paymentId: 'pay-7',
      invoiceId: 'inv-7',
      invoiceNumber: 'INV-2026-01690',
      customerDisplayName: 'Ana Ruiz',
      customerReference: null,
      appliedAmount: 120.5,
      appliedAt: '2026-10-04T16:20:00Z',
      currency: 'USD',
      creditCreatedAmount: null,
      reversed: false,
      reversedAt: null,
      actions: ['UNDO'],
      source: AutomaticPaymentApplicationRowSourceEnum.PaymentSettled,
    },
    {
      paymentApplicationId: 'app-2',
      paymentId: 'pay-8',
      invoiceId: 'inv-8',
      invoiceNumber: 'INV-2026-01691',
      customerDisplayName: 'Ana Ruiz',
      appliedAmount: 50,
      appliedAt: '2026-10-03T16:20:00Z',
      currency: 'USD',
      reversed: true,
      reversedAt: '2026-10-04T09:00:00Z',
      actions: [],
      source: AutomaticPaymentApplicationRowSourceEnum.PaymentSettled,
    },
  ],
  page: 0,
  size: AUTOMATIC_PAGE_SIZE,
  totalElements: 2,
  totalPages: 1,
};

const applyResponse: PaymentApplicationResponse = {
  paymentId: 'pay-1',
  applicationRequestId: 'key-1',
  appliedAmount: 4000,
  remainingAmount: 615,
  currency: 'USD',
  applications: [
    { invoiceId: 'inv-9', appliedAmount: 4000, invoiceBalanceAfter: 615, paymentApplicationId: 'app-9' },
  ],
};

const remainderResponse: RemainderCreditResponse = {
  amount: 615,
  createdAt: '2026-10-06T10:00:00Z',
  creditId: 'credit-1',
  currency: 'USD',
  paymentId: 'pay-1',
  remainingAmount: 0,
  requestId: 'key-2',
};

const refundResponse: CustomerCreditTransactionResponse = {
  amount: 615,
  creditId: 'credit-1',
  creditOpenAmountAfter: 0,
  requestId: 'key-3',
  currency: 'USD',
};

const agedReceivables: AgedReceivablesReport = {
  asOfDate: '2026-10-06',
  generatedAt: '2026-10-06T14:05:00Z',
  rows: [],
  totals: {
    totalOutstanding: 18240.5,
    notYetDue: 11000.25,
    overdue: 7240.25,
    days1To30: 4100,
    days31To60: 2000,
    days61To90: 1140.25,
    days90Plus: 0,
  },
};

describe('CustomerPaymentsService (ADR-0035 §9: full argument lists)', () => {
  let payments: {
    listUnappliedPayments: ReturnType<typeof vi.fn>;
    listCustomerOpenInvoices: ReturnType<typeof vi.fn>;
    listAutomaticPaymentApplications: ReturnType<typeof vi.fn>;
    applyPayment: ReturnType<typeof vi.fn>;
    creditPaymentRemainder: ReturnType<typeof vi.fn>;
    reversePaymentApplication: ReturnType<typeof vi.fn>;
  };
  let credits: { refundCustomerCredit: ReturnType<typeof vi.fn> };
  let reporting: { generateAgedReceivables: ReturnType<typeof vi.fn> };
  let service: CustomerPaymentsService;

  beforeEach(() => {
    payments = {
      listUnappliedPayments: vi.fn((_status: string, _customer: string | undefined, page: number) =>
        of(unappliedPage(page, 1)),
      ),
      listCustomerOpenInvoices: vi.fn(() => of(openInvoicesPage)),
      listAutomaticPaymentApplications: vi.fn(() => of(automaticPage)),
      applyPayment: vi.fn(() => of(applyResponse)),
      creditPaymentRemainder: vi.fn(() => of(remainderResponse)),
      reversePaymentApplication: vi.fn(() => of({})),
    };
    credits = { refundCustomerCredit: vi.fn(() => of(refundResponse)) };
    reporting = { generateAgedReceivables: vi.fn(() => of(agedReceivables)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PaymentApplicationsSdk, useValue: payments },
        { provide: CustomerCreditsSdk, useValue: credits },
        { provide: FinancialReportingSdk, useValue: reporting },
      ],
    });
    service = TestBed.inject(CustomerPaymentsService);
  });

  it('waitingPayments reads AVAILABLE payments and maps the served summary and suggestion', async () => {
    const list = await firstValueFrom(service.waitingPayments());

    expect(payments.listUnappliedPayments).toHaveBeenCalledTimes(1);
    expect(payments.listUnappliedPayments).toHaveBeenCalledWith('AVAILABLE', undefined, 0, PAYMENTS_PAGE_SIZE);
    const expected: WaitingPaymentsList = {
      items: [
        {
          paymentId: 'pay-0',
          customerId: 'cust-1',
          customerName: 'Harbor Fleet Services',
          customerReference: 'C-1042',
          sourceInvoiceId: 'inv-9',
          sourceInvoiceNumber: 'INV-2026-01702',
          method: 'CARD',
          receivedAt: '2026-10-05T14:00:00Z',
          totalAmount: 4615,
          unappliedAmount: 4615,
          currency: 'USD',
          reasons: ['REMITTANCE_REFERENCE', 'SAME_CUSTOMER', 'EXACT_TOTAL'],
          suggestedInvoices: [
            { invoiceId: 'inv-9', invoiceNumber: 'INV-2026-01702', balanceDue: 4615, suggestedAmount: 4615 },
          ],
          suggestedTotal: 4615,
          leftOver: 0,
        },
      ],
      waitingCount: 1,
      totalUnapplied: 4615,
      currency: 'USD',
      asOf: '2026-10-06T10:00:00Z',
      truncated: false,
    };
    expect(list).toEqual(expected);
  });

  it('waitingPayments reads every page, bounded, and flags a list the bound cut', async () => {
    payments.listUnappliedPayments.mockImplementation((_s: string, _c: string | undefined, page: number) =>
      of(unappliedPage(page, MAX_LIST_PAGES + 2)),
    );

    const list = await firstValueFrom(service.waitingPayments());

    expect(payments.listUnappliedPayments).toHaveBeenCalledTimes(MAX_LIST_PAGES);
    expect(payments.listUnappliedPayments).toHaveBeenLastCalledWith(
      'AVAILABLE',
      undefined,
      MAX_LIST_PAGES - 1,
      PAYMENTS_PAGE_SIZE,
    );
    expect(list.items.length).toBe(MAX_LIST_PAGES);
    expect(list.truncated).toBe(true);
    expect(list.waitingCount).toBe(MAX_LIST_PAGES + 2);
  });

  it('keeps a walk-in (CASH) payment’s null left-over as null, never 0', async () => {
    const page = unappliedPage(0, 1);
    payments.listUnappliedPayments.mockReturnValue(
      of({ ...page, items: [{ ...page.items[0], suggestion: { ...page.items[0].suggestion, leftOver: null } }] }),
    );
    const list = await firstValueFrom(service.waitingPayments());
    expect(list.items[0].leftOver).toBeNull();
  });

  it('openInvoices reads the customer’s open invoices with full arguments', async () => {
    const list = await firstValueFrom(service.openInvoices('cust-1'));

    expect(payments.listCustomerOpenInvoices).toHaveBeenCalledWith('cust-1', 0, OPEN_INVOICES_PAGE_SIZE);
    const expected: OpenInvoicesList = {
      items: [
        {
          invoiceId: 'inv-9',
          invoiceNumber: 'INV-2026-01702',
          documentDate: '2026-09-01',
          dueDate: '2026-10-01',
          overdue: true,
          balanceDue: 4615,
          currency: 'USD',
        },
      ],
      truncated: false,
    };
    expect(list).toEqual(expected);
  });

  it('automaticApplications passes since and offers Undo only where the server lists UNDO', async () => {
    const list = await firstValueFrom(service.automaticApplications('2026-09-29T04:00:00.000Z'));

    expect(payments.listAutomaticPaymentApplications).toHaveBeenCalledWith(
      '2026-09-29T04:00:00.000Z',
      0,
      AUTOMATIC_PAGE_SIZE,
    );
    const expected: AutomaticApplicationsList = {
      items: [
        {
          applicationId: 'app-1',
          paymentId: 'pay-7',
          invoiceNumber: 'INV-2026-01690',
          customerName: 'Ana Ruiz',
          customerReference: null,
          appliedAmount: 120.5,
          currency: 'USD',
          appliedAt: '2026-10-04T16:20:00Z',
          reversed: false,
          reversedAt: null,
          undoOffered: true,
        },
        {
          applicationId: 'app-2',
          paymentId: 'pay-8',
          invoiceNumber: 'INV-2026-01691',
          customerName: 'Ana Ruiz',
          customerReference: null,
          appliedAmount: 50,
          currency: 'USD',
          appliedAt: '2026-10-03T16:20:00Z',
          reversed: true,
          reversedAt: '2026-10-04T09:00:00Z',
          undoOffered: false,
        },
      ],
      truncated: false,
    };
    expect(list).toEqual(expected);
  });

  it('applyPayment sends the key and the lines as amountToApply, and maps the served result', async () => {
    const result = await firstValueFrom(
      service.applyPayment('pay-1', 'key-1', [{ invoiceId: 'inv-9', amount: 4000 }]),
    );

    expect(payments.applyPayment).toHaveBeenCalledWith('pay-1', {
      applicationRequestId: 'key-1',
      applications: [{ invoiceId: 'inv-9', amountToApply: 4000 }],
    });
    const expected: ApplyResult = {
      appliedAmount: 4000,
      remainingAmount: 615,
      currency: 'USD',
      lines: [{ invoiceId: 'inv-9', appliedAmount: 4000, balanceAfter: 615 }],
      creditAmount: null,
    };
    expect(result).toEqual(expected);
  });

  it('creditRemainder sends expectedAmount and requestId (S35)', async () => {
    const credit = await firstValueFrom(service.creditRemainder('pay-1', 615, 'key-2'));

    expect(payments.creditPaymentRemainder).toHaveBeenCalledWith('pay-1', { expectedAmount: 615, requestId: 'key-2' });
    const expected: RemainderCredit = { creditId: 'credit-1', amount: 615, currency: 'USD' };
    expect(credit).toEqual(expected);
  });

  it('refundCredit sends the amount and requestId', async () => {
    const refunded = await firstValueFrom(service.refundCredit('credit-1', 615, 'key-3'));

    expect(credits.refundCustomerCredit).toHaveBeenCalledWith('credit-1', { amount: 615, requestId: 'key-3' });
    expect(refunded).toBe(615);
  });

  it('reverseApplication sends the reason', async () => {
    await firstValueFrom(service.reverseApplication('app-1', 'Customer paid the wrong invoice'));

    expect(payments.reversePaymentApplication).toHaveBeenCalledWith('app-1', {
      reason: 'Customer paid the wrong invoice',
    });
  });

  it('receivablesTotals reads the aging as of a local date', async () => {
    const totals = await firstValueFrom(service.receivablesTotals('2026-10-06'));

    expect(reporting.generateAgedReceivables).toHaveBeenCalledWith('2026-10-06');
    const expected: ReceivablesTotals = {
      asOfDate: '2026-10-06',
      generatedAt: '2026-10-06T14:05:00Z',
      totalOutstanding: 18240.5,
      overdue: 7240.25,
    };
    expect(totals).toEqual(expected);
  });
});
