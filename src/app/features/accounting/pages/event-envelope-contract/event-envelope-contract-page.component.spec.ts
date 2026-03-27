import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../services/accounting.service';
import { EventEnvelopeContractPageComponent } from './event-envelope-contract-page.component';

describe('EventEnvelopeContractPageComponent', () => {
  let fixture: ComponentFixture<EventEnvelopeContractPageComponent>;

  const accountingServiceStub = {
    getEventEnvelopeContract: vi.fn().mockReturnValue(
      of({
        contractVersion: 'v1',
        identifierStrategy: 'UUIDv7',
        fields: [{ name: 'eventId', type: 'string', required: true }],
        traceabilityIds: [],
        processingStatuses: [],
        idempotencyOutcomes: [],
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventEnvelopeContractPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventEnvelopeContractPageComponent);
  });

  it('renders fields tab with data', () => {
    fixture.detectChanges();
    const tab = fixture.nativeElement.querySelector('[data-testid="fields-tab"]');
    expect(tab.textContent).toContain('eventId');
  });

  it('renders forbidden state when service returns 403', () => {
    accountingServiceStub.getEventEnvelopeContract.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();

    const forbidden = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(forbidden).toBeTruthy();
  });

  it('renders loading state when service has not yet responded', () => {
    accountingServiceStub.getEventEnvelopeContract.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[aria-busy="true"]');
    expect(el).toBeTruthy();
  });

  it('sets pageState to error when service returns 500', () => {
    accountingServiceStub.getEventEnvelopeContract.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.pageState()).toBe('error');
  });

  it('clicking the traceability tab updates activeTab to traceability', () => {
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    tabs[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab()).toBe('traceability');
  });
});
