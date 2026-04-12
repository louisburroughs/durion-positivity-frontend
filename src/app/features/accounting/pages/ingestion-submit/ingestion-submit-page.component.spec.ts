import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../services/accounting.service';
import { IngestionSubmitPageComponent } from './ingestion-submit-page.component';

describe('IngestionSubmitPageComponent', () => {
  let fixture: ComponentFixture<IngestionSubmitPageComponent>;
  let component: IngestionSubmitPageComponent;

  const accountingServiceStub = {
    submitEvent: vi.fn().mockReturnValue(of({ eventId: 'ok-1' })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestionSubmitPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IngestionSubmitPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('validates eventId UUIDv7 format', () => {
    component.form.patchValue({ eventId: 'not-uuid' });
    expect(component.form.controls.eventId.invalid).toBe(true);

    component.form.patchValue({
      eventId: '018f5ea6-4b83-7f92-9f4c-0fa8a0a8f001',
    });
    expect(component.form.controls.eventId.valid).toBe(true);
  });

  it('validates JSON payload', () => {
    component.form.patchValue({ payload: '{bad json}' });
    expect(component.form.controls.payload.invalid).toBe(true);

    component.form.patchValue({ payload: '{"invoiceId":"1"}' });
    expect(component.form.controls.payload.valid).toBe(true);
  });

  it('submit button disabled when form invalid', () => {
    component.form.patchValue({
      eventId: 'invalid',
      eventType: '',
      organizationId: '',
      payload: '',
    });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="submit-button"]');
    expect(button.disabled).toBe(true);
  });

  it('submit() sets state to success on valid form', () => {
    component.form.patchValue({
      eventId: '018f5ea6-4b83-7f92-9f4c-0fa8a0a8f001',
      eventType: 'InvoiceIssued',
      organizationId: 'org-1',
      payload: '{"invoiceId":"1"}',
    });
    component.submit();
    expect(component.state()).toBe('success');
    expect(component.outcome()?.eventId).toBe('ok-1');
  });

  it('submit() sets state to error when service returns 500', () => {
    accountingServiceStub.submitEvent.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    component.form.patchValue({
      eventId: '018f5ea6-4b83-7f92-9f4c-0fa8a0a8f001',
      eventType: 'InvoiceIssued',
      organizationId: 'org-1',
      payload: '{"invoiceId":"1"}',
    });
    component.submit();
    expect(component.state()).toBe('error');
  });

  it('submit() sets state to forbidden when service returns 403', () => {
    accountingServiceStub.submitEvent.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    component.form.patchValue({
      eventId: '018f5ea6-4b83-7f92-9f4c-0fa8a0a8f001',
      eventType: 'InvoiceIssued',
      organizationId: 'org-1',
      payload: '{"invoiceId":"1"}',
    });

    component.submit();
    expect(component.state()).toBe('forbidden');
  });

  it('submit() does not call service when form is invalid', () => {
    accountingServiceStub.submitEvent.mockClear();
    component.submit();
    expect(accountingServiceStub.submitEvent).not.toHaveBeenCalled();
  });

  it('keeps page interactive before any backend authorization response', () => {
    expect(component.state()).not.toBe('forbidden');
  });
});
