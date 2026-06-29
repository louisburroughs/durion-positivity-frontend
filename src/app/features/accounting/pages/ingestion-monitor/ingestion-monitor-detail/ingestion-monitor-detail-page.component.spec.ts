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
        eventId: 'event-1',
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

  it('renders event detail when loaded', () => {
    const detail = fixture.nativeElement.querySelector('[data-testid="event-detail"]');
    expect(detail).toBeTruthy();
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
