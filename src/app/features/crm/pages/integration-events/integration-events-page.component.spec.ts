import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { CrmIntegrationService } from '../../services/crm-integration.service';
import { IntegrationEventsPageComponent } from './integration-events-page.component';

describe('IntegrationEventsPageComponent', () => {
  let fixture: ComponentFixture<IntegrationEventsPageComponent>;

  const crmIntegrationServiceStub = {
    listEvents: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
    getEvent: vi.fn().mockReturnValue(of(null)),
    getReprocessingHistory: vi.fn().mockReturnValue(of([])),
    getEventProcessingLog: vi.fn().mockReturnValue(of('')),
  };

  const sampleEvent = {
    eventId: 'ev-001',
    eventType: 'InvoiceIssued',
    processingStatus: 'PENDING' as const,
    receivedAt: '2026-01-01T00:00:00Z',
    organizationId: 'org-abc',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IntegrationEventsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CrmIntegrationService, useValue: crmIntegrationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IntegrationEventsPageComponent);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading state when loading() is true', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  // ── Event list ───────────────────────────────────────────────────────────────

  it('renders .event-list container when events are loaded', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(
      of({ items: [sampleEvent], totalCount: 1 }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.event-list');
    expect(el).toBeTruthy();
  });

  it('renders event rows with data-testid="event-row" for each event', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(
      of({
        items: [
          sampleEvent,
          { ...sampleEvent, eventId: 'ev-002', eventType: 'PaymentReceived' },
        ],
        totalCount: 2,
      }),
    );
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="event-row"]');
    expect(rows.length).toBe(2);
  });

  it('renders empty state when service returns no events', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(
      of({ items: [], totalCount: 0 }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(el).toBeTruthy();
  });

  // ── Event detail ─────────────────────────────────────────────────────────────

  it('shows .event-detail when an event is selected', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(
      of({ items: [sampleEvent], totalCount: 1 }),
    );
    crmIntegrationServiceStub.getEvent.mockReturnValueOnce(of(sampleEvent));
    fixture.detectChanges();

    // Select the first event row
    const row = fixture.nativeElement.querySelector('[data-testid="event-row"]');
    expect(row).toBeTruthy();
    row.click();
    fixture.detectChanges();

    const detail = fixture.nativeElement.querySelector('.event-detail');
    expect(detail).toBeTruthy();
  });

  // ── Error states ─────────────────────────────────────────────────────────────

  it('shows .crm-not-authorized when loaded with 403 error', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.crm-not-authorized');
    expect(el).toBeTruthy();
  });

  it('shows error state when service errors with 500', () => {
    crmIntegrationServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  // ── selectEvent() signal paths ───────────────────────────────────────────────

  it('clears selectedEvent to null immediately when selectEvent() is called before forkJoin resolves', () => {
    fixture.detectChanges();

    // Populate selectedEvent via a first fully-resolved call
    crmIntegrationServiceStub.getEvent.mockReturnValueOnce(of(sampleEvent));
    crmIntegrationServiceStub.getEventProcessingLog.mockReturnValueOnce(of('log'));
    crmIntegrationServiceStub.getReprocessingHistory.mockReturnValueOnce(of([]));
    fixture.componentInstance.selectEvent('ev-001');
    expect(fixture.componentInstance.selectedEvent()).toEqual(sampleEvent);

    // Second call: hold forkJoin open with Subjects so it never resolves
    crmIntegrationServiceStub.getEvent.mockReturnValueOnce(new Subject());
    crmIntegrationServiceStub.getEventProcessingLog.mockReturnValueOnce(new Subject());
    crmIntegrationServiceStub.getReprocessingHistory.mockReturnValueOnce(new Subject());
    fixture.componentInstance.selectEvent('ev-002');

    // selectedEvent must be null immediately — R2-F4: cleared synchronously before forkJoin resolves
    expect(fixture.componentInstance.selectedEvent()).toBeNull();
  });

  it('sets detailErrorState when getEvent() fails', () => {
    fixture.detectChanges();
    crmIntegrationServiceStub.getEvent.mockReturnValueOnce(throwError(() => new Error('not found')));
    fixture.componentInstance.selectEvent('ev-001');
    expect(fixture.componentInstance.detailErrorState()).not.toBeNull();
  });

  it('sets detailErrorState when getEventProcessingLog() fails', () => {
    fixture.detectChanges();
    crmIntegrationServiceStub.getEventProcessingLog.mockReturnValueOnce(
      throwError(() => new Error('log error')),
    );
    fixture.componentInstance.selectEvent('ev-001');
    expect(fixture.componentInstance.detailErrorState()).not.toBeNull();
  });

  it('sets detailErrorState when getReprocessingHistory() fails', () => {
    fixture.detectChanges();
    crmIntegrationServiceStub.getReprocessingHistory.mockReturnValueOnce(
      throwError(() => new Error('history error')),
    );
    fixture.componentInstance.selectEvent('ev-001');
    expect(fixture.componentInstance.detailErrorState()).not.toBeNull();
  });

  // R3-F1: aside visible when detailErrorState is set but selectedEvent is null
  it('renders .event-detail aside when selectedEvent is null but detailErrorState is set (R3-F1)', () => {
    fixture.detectChanges();
    const errorMessage = 'Unable to load event details. Please try again.';
    fixture.componentInstance.detailErrorState.set(errorMessage);
    fixture.detectChanges();

    const detail = fixture.nativeElement.querySelector('.event-detail');
    expect(detail).not.toBeNull();

    const alert = fixture.nativeElement.querySelector('.alert--error');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain(errorMessage);
  });

  it('populates processingLog signal on successful getEventProcessingLog()', () => {
    const logText = 'Processed at 2026-01-01\nSuccess.';
    fixture.detectChanges();
    crmIntegrationServiceStub.getEventProcessingLog.mockReturnValueOnce(of(logText));
    fixture.componentInstance.selectEvent('ev-001');
    expect(fixture.componentInstance.processingLog()).toBe(logText);
  });

  it('populates reprocessingHistory signal on successful getReprocessingHistory()', () => {
    const history = [
      { attemptId: 'att-1', eventId: 'ev-001', attemptedAt: '2026-01-09T00:00:00Z', outcome: 'SUCCESS' },
    ];
    fixture.detectChanges();
    crmIntegrationServiceStub.getReprocessingHistory.mockReturnValueOnce(of(history));
    fixture.componentInstance.selectEvent('ev-001');
    expect(fixture.componentInstance.reprocessingHistory()).toEqual(history);
  });
});
