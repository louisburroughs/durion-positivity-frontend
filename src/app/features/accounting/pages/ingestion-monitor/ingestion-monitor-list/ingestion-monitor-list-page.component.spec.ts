import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { IngestionMonitorListPageComponent } from './ingestion-monitor-list-page.component';

describe('IngestionMonitorListPageComponent', () => {
  let fixture: ComponentFixture<IngestionMonitorListPageComponent>;
  let component: IngestionMonitorListPageComponent;
  const queryParamMap$ = new BehaviorSubject(
    convertToParamMap({ eventType: 'InvoiceIssued' }),
  );

  const accountingServiceStub = {
    listEvents: vi.fn().mockReturnValue(
      of({
        items: [],
        totalCount: 0,
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestionMonitorListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IngestionMonitorListPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const loading = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(loading).toBeTruthy();
  });

  it('renders event rows when service returns data', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      of({
        items: [
          {
            eventId: 'e-1',
            eventType: 'InvoiceIssued',
            processingStatus: 'PROCESSED',
          },
        ],
        totalCount: 1,
      }),
    );

    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="event-row"]');
    expect(rows.length).toBe(1);
  });

  it('renders error state when service errors', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );

    fixture.detectChanges();
    const error = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(error).toBeTruthy();
  });

  it('pre-fills eventType filter from query param', () => {
    fixture.detectChanges();
    expect(component.filters().eventType).toBe('InvoiceIssued');
    const input = fixture.nativeElement.querySelector('[data-testid="event-type-filter"]');
    expect(input.value).toBe('InvoiceIssued');
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    expect(component.pageState()).toBe('forbidden');
  });

  it('renders not-found state when service errors with 404', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 404 })),
    );
    fixture.detectChanges();
    expect(component.pageState()).toBe('not-found');
  });

  it('goToDetail(row) navigates to the event detail page', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.goToDetail({ eventId: 'e-99', eventType: 'InvoiceIssued', processingStatus: 'PROCESSED' as any });
    expect(spy).toHaveBeenCalledWith(['/app/accounting/events', 'e-99']);
  });
});
