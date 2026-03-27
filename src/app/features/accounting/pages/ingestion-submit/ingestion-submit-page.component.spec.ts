import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { AccountingService } from '../../services/accounting.service';
import { IngestionSubmitPageComponent } from './ingestion-submit-page.component';

describe('IngestionSubmitPageComponent', () => {
  let fixture: ComponentFixture<IngestionSubmitPageComponent>;
  let component: IngestionSubmitPageComponent;

  const accountingServiceStub = {
    submitEvent: vi.fn().mockReturnValue(of({ eventId: 'ok-1' })),
  };

  const authServiceStub = {
    currentUserClaims: signal({
      sub: 'tester',
      roles: ['ROLE_ADMIN'],
      authorities: ['accounting:events:submit'],
      exp: 9999999999,
      iat: 1,
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestionSubmitPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        { provide: AuthService, useValue: authServiceStub },
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

  it('submit() does not call service when form is invalid', () => {
    accountingServiceStub.submitEvent.mockClear();
    component.submit();
    expect(accountingServiceStub.submitEvent).not.toHaveBeenCalled();
  });
});

describe('IngestionSubmitPageComponent — no permission', () => {
  const accountingServiceStub = {
    submitEvent: vi.fn(),
  };

  const noPermAuthStub = {
    currentUserClaims: signal({
      sub: 'tester',
      roles: ['ROLE_USER'],
      authorities: [] as string[],
      exp: 9999999999,
      iat: 1,
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestionSubmitPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        { provide: AuthService, useValue: noPermAuthStub },
      ],
    }).compileComponents();
  });

  it('renders forbidden state when user lacks submit permission', () => {
    const f = TestBed.createComponent(IngestionSubmitPageComponent);
    f.detectChanges();

    const forbidden = f.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(forbidden).toBeTruthy();
    const form = f.nativeElement.querySelector('form');
    expect(form).toBeFalsy();
  });
});
