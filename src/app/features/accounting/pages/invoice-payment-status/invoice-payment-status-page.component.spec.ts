import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../services/accounting.service';
import {
  AccountingEventDetail,
  AccountingEventListItem,
  IngestionProcessingStatus,
  InvoicePaymentStatus,
  PagedResponse,
} from '../../models/accounting.models';
import { InvoicePaymentStatusPageComponent } from './invoice-payment-status-page.component';

const paidStatusFixture: InvoicePaymentStatus = {
  invoiceId: 'inv-001',
  paymentStatus: 'PAID',
  balanceDue: 0,
};

const unpaidStatusFixture: InvoicePaymentStatus = {
  invoiceId: 'inv-002',
  paymentStatus: 'UNPAID',
  balanceDue: 150,
};

const eventListFixture: AccountingEventListItem[] = [
  {
    eventId: 'evt-001',
    eventType: 'InvoiceIssued',
    processingStatus: IngestionProcessingStatus.Processed,
  },
];

const eventDetailFixture: AccountingEventDetail = {
  eventId: 'evt-001',
  eventType: 'InvoiceIssued',
  processingStatus: IngestionProcessingStatus.Processed,
};

describe('InvoicePaymentStatusPageComponent', () => {
  let fixture: ComponentFixture<InvoicePaymentStatusPageComponent>;
  let component: InvoicePaymentStatusPageComponent;

  const accountingServiceStub = {
    getInvoiceStatus: vi.fn(),
    listEvents: vi.fn(),
    getEvent: vi.fn(),
  };

  beforeEach(async () => {
    accountingServiceStub.getInvoiceStatus.mockReturnValue(of(paidStatusFixture));

    const pagedEvents: PagedResponse<AccountingEventListItem> = {
      items: eventListFixture,
      content: eventListFixture,
      totalCount: 1,
    };
    accountingServiceStub.listEvents.mockReturnValue(of(pagedEvents));
    accountingServiceStub.getEvent.mockReturnValue(of(eventDetailFixture));

    await TestBed.configureTestingModule({
      imports: [InvoicePaymentStatusPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ invoiceId: 'inv-001' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoicePaymentStatusPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads invoice status and events on init', () => {
    expect(accountingServiceStub.getInvoiceStatus).toHaveBeenCalledWith('inv-001');
    expect(accountingServiceStub.listEvents).toHaveBeenCalledWith({ invoiceId: 'inv-001' });
    expect(component.state()).toBe('ready');
    expect(component.invoiceStatus()).toEqual(paidStatusFixture);
    expect(component.events()).toHaveLength(1);
  });

  it('derives PAID payment status from fixture', () => {
    expect(component.paymentStatus()).toBe('PAID');
  });

  it('derives UNPAID payment status from fixture', () => {
    accountingServiceStub.getInvoiceStatus.mockReturnValueOnce(of(unpaidStatusFixture));

    const refreshed = TestBed.createComponent(InvoicePaymentStatusPageComponent);
    refreshed.detectChanges();

    expect(refreshed.componentInstance.paymentStatus()).toBe('UNPAID');
  });

  it('sets error state and error key when invoice status load fails', () => {
    accountingServiceStub.getInvoiceStatus.mockReturnValueOnce(
      throwError(() => new Error('load failed')),
    );

    const failingFixture = TestBed.createComponent(InvoicePaymentStatusPageComponent);
    failingFixture.detectChanges();

    expect(failingFixture.componentInstance.state()).toBe('error');
    expect(failingFixture.componentInstance.errorKey()).toBe(
      'ACCOUNTING.INVOICE_PAYMENT_STATUS.ERROR.LOAD',
    );
  });

  it('renders empty state when invoice has no events', () => {
    const emptyPagedEvents: PagedResponse<AccountingEventListItem> = {
      items: [],
      content: [],
      totalCount: 0,
    };
    accountingServiceStub.listEvents.mockReturnValueOnce(of(emptyPagedEvents));

    const emptyFixture = TestBed.createComponent(InvoicePaymentStatusPageComponent);
    emptyFixture.detectChanges();

    expect(emptyFixture.componentInstance.state()).toBe('empty');
  });

  it('loads event detail by id', () => {
    component.loadEventDetail('evt-001');

    expect(accountingServiceStub.getEvent).toHaveBeenCalledWith('evt-001');
    expect(component.selectedEvent()).toEqual(eventDetailFixture);
  });

  it('should set state to error and errorKey when loadEventDetail fails', () => {
    accountingServiceStub.getEvent.mockReturnValueOnce(
      throwError(() => new Error('event load failed')),
    );

    component.loadEventDetail('evt-001');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ACCOUNTING.INVOICE_PAYMENT_STATUS.ERROR.LOAD');
  });
});
