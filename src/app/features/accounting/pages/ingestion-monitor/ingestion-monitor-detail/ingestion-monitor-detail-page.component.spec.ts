import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { IngestionMonitorDetailPageComponent } from './ingestion-monitor-detail-page.component';

describe('IngestionMonitorDetailPageComponent', () => {
  let fixture: ComponentFixture<IngestionMonitorDetailPageComponent>;

  const accountingServiceStub = {
    getEvent: vi.fn().mockReturnValue(
      of({
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventReference: 'AE-202609-15',
        eventType: 'InvoiceIssued',
        processingStatus: 'PROCESSED',
      }),
    ),
    getReprocessingHistory: vi.fn().mockReturnValue(of([])),
    retryEvent: vi.fn().mockReturnValue(of({ jobId: 'job-1' })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestionMonitorDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ eventId: 'event-1' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IngestionMonitorDetailPageComponent);
    fixture.detectChanges();
  });

  it('renders payload references by name and keeps the raw payload collapsed', () => {
    accountingServiceStub.getEvent.mockReturnValueOnce(
      of({
        eventId: '01a04a72-d682-7d9a-9f73-91c89b4bb8c4',
        eventReference: 'AE-202608-37',
        eventType: 'INVOICE_PAYMENT',
        processingStatus: 'RECEIVED',
        payload: { invoiceId: '01a04a72-d08a-72ff-8483-cdcdb7ad894a', amountPaid: 286.17 },
        payloadReferences: [
          {
            path: 'payload.invoiceId',
            rawValue: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
            id: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
            referenceType: 'INVOICE',
            displayReference: 'INV-1787955433643-01a04a72',
            displayName: null,
          },
        ],
      }),
    );
    const payloadFixture = TestBed.createComponent(IngestionMonitorDetailPageComponent);
    payloadFixture.detectChanges();

    const refs = payloadFixture.nativeElement.querySelector('[data-testid="payload-references"]');
    expect(refs).toBeTruthy();
    expect(refs.textContent).toContain('INV-1787955433643-01a04a72');

    // The raw payload still holds the id for audit, but stays behind a closed
    // <details>, so it is not part of the page's visible text.
    const raw = payloadFixture.nativeElement.querySelector('[data-testid="raw-payload"]');
    expect(raw).toBeTruthy();
    expect(raw.hasAttribute('open')).toBe(false);
    expect(refs.textContent).not.toContain('01a04a72-d08a-72ff-8483-cdcdb7ad894a');
  });

  it('shows a placeholder for a reference accounting could not resolve', () => {
    accountingServiceStub.getEvent.mockReturnValueOnce(
      of({
        eventId: '01a04a72-d682-7d9a-9f73-91c89b4bb8c4',
        eventReference: 'AE-202608-37',
        eventType: 'INVOICE_PAYMENT',
        processingStatus: 'RECEIVED',
        payload: {},
        payloadReferences: [
          {
            path: 'payload.customerId',
            rawValue: '01a029d2-2004-7b37-a47b-de23679c2d36',
            id: '01a029d2-2004-7b37-a47b-de23679c2d36',
            referenceType: 'CUSTOMER',
            displayReference: null,
            displayName: null,
          },
        ],
      }),
    );
    const unresolvedFixture = TestBed.createComponent(IngestionMonitorDetailPageComponent);
    unresolvedFixture.detectChanges();

    const refs = unresolvedFixture.nativeElement.querySelector('[data-testid="payload-references"]');
    expect(refs.textContent).not.toContain('01a029d2-2004-7b37-a47b-de23679c2d36');
  });

  it('numbers replay attempts oldest-first instead of showing the attemptId UUID', () => {
    accountingServiceStub.getReprocessingHistory.mockReturnValueOnce(
      of([
        {
          attemptId: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
          attemptedAt: '2026-03-20T12:00:00Z',
          outcome: 'FAILURE',
        },
        {
          attemptId: '01a029d2-2004-7b37-a47b-de23679c2d36',
          attemptedAt: '2026-03-18T12:00:00Z',
          outcome: 'SUCCESS',
        },
      ]),
    );
    const historyFixture = TestBed.createComponent(IngestionMonitorDetailPageComponent);
    historyFixture.detectChanges();

    const rows = historyFixture.nativeElement.querySelectorAll('.ledger-table tbody tr');
    expect(rows.length).toBe(2);
    // Oldest attempt is numbered 1, regardless of the order the API returned.
    expect(rows[0].querySelector('td').textContent.trim()).toBe('1');
    expect(rows[1].querySelector('td').textContent.trim()).toBe('2');
    expect(historyFixture.nativeElement.textContent).not.toContain(
      '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
    );
    expect(historyFixture.nativeElement.textContent).not.toContain(
      '01a029d2-2004-7b37-a47b-de23679c2d36',
    );
  });

  it('renders event detail when loaded', () => {
    const detail = fixture.nativeElement.querySelector('[data-testid="event-detail"]');
    expect(detail).toBeTruthy();
    expect(detail.querySelector('#event-reference').value).toBe('AE-202609-15');
  });

  it('renders unavailable instead of the UUID when the event reference is missing', () => {
    accountingServiceStub.getEvent.mockReturnValueOnce(
      of({
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'InvoiceIssued',
        processingStatus: 'PROCESSED',
      }),
    );
    const missingReferenceFixture = TestBed.createComponent(IngestionMonitorDetailPageComponent);
    missingReferenceFixture.detectChanges();

    const detail = missingReferenceFixture.nativeElement.querySelector('[data-testid="event-detail"]');
    expect(detail.querySelector('#event-reference').value).toBe('COMMON.NOT_AVAILABLE');
    expect(detail.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('shows payload section when page is ready', () => {
    fixture.detectChanges();

    const payload = fixture.nativeElement.querySelector('[data-testid="payload-section"]');
    expect(payload).toBeTruthy();
  });

  it('canViewPayload() returns false while page is not ready', () => {
    fixture.componentInstance.pageState.set('loading');
    expect(fixture.componentInstance.canViewPayload()).toBe(false);
  });

  it('retry button disabled when justification empty', () => {
    const button = fixture.nativeElement.querySelector('[data-testid="retry-button"]');
    expect(button.disabled).toBe(true);
  });

  it('retry button is enabled when justification has at least 10 characters', () => {
    fixture.componentInstance.retryJustification.setValue('long enough reason here');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('[data-testid="retry-button"]');
    expect(button.disabled).toBe(false);
  });

  it('submitRetry() calls retryEvent with trimmed justification and sets retryState to polling', () => {
    fixture.componentInstance.retryJustification.setValue('valid retry reason given');
    fixture.componentInstance.submitRetry();
    expect(accountingServiceStub.retryEvent).toHaveBeenCalledWith('event-1', {
      justification: 'valid retry reason given',
    });
    expect(fixture.componentInstance.retryState()).toBe('polling');
  });

  it('canRetry() returns false when page is not ready', () => {
    fixture.componentInstance.pageState.set('error');
    expect(fixture.componentInstance.canRetry()).toBe(false);
  });

  describe('pollRetryOutcome()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set retryState to error when polling completes without terminal status', () => {
      accountingServiceStub.getEvent.mockReturnValue(
        of({ processingStatus: 'RECEIVED' }),
      );
      fixture.componentInstance.retryState.set('polling');
      fixture.componentInstance['pollRetryOutcome']();
      vi.advanceTimersByTime(3000);
      expect(fixture.componentInstance.retryState()).toBe('error');
    });
  });
});
