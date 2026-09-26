import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../services/accounting.service';
import { EventEnvelopeContractPageComponent } from './event-envelope-contract-page.component';

describe('EventEnvelopeContractPageComponent', () => {
  let fixture: ComponentFixture<EventEnvelopeContractPageComponent>;

  // Matches the real backend response (durion-positivity-backend#2207): only `version`,
  // `fields`, and `examples` — no traceabilityIds/processingStatuses/idempotencyOutcomes/
  // identifierStrategy. Issue #380: the page previously assumed those were always present and
  // crashed reading `value.traceabilityIds.length`.
  const accountingServiceStub = {
    getEventEnvelopeContract: vi.fn().mockReturnValue(
      of({
        version: 'v1',
        fields: [{ name: 'eventId', type: 'string', required: true }],
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

  it('renders a localized "not provided" state on the traceability tab instead of crashing when the backend omits traceabilityIds (issue #380)', () => {
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(() => tabs[1].click()).not.toThrow();
    fixture.detectChanges();

    const notProvided = fixture.nativeElement.querySelector('[data-testid="traceability-not-provided"]');
    expect(notProvided).toBeTruthy();
  });

  it('renders the traceability table when the backend does provide traceabilityIds', () => {
    accountingServiceStub.getEventEnvelopeContract.mockReturnValueOnce(
      of({
        version: 'v1',
        fields: [{ name: 'eventId', type: 'string', required: true }],
        traceabilityIds: [{ name: 'correlationId', type: 'string' }],
      }),
    );
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    tabs[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="traceability-not-provided"]')).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('correlationId');
  });
});
