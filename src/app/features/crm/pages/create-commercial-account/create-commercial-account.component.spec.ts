import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { CreateCommercialAccountComponent } from './create-commercial-account.component';
import { CrmService } from '../../services/crm.service';
import { BillingTermsRef, DuplicateCheckResponse } from '../../models/crm.models';

const crmServiceStub = {
  listBillingTerms: vi.fn(),
  checkCommercialAccountDuplicates: vi.fn(),
  createCommercialAccount: vi.fn(),
};

const routerStub = { navigate: vi.fn() };

const TERMS: BillingTermsRef[] = [{ id: 'NET_30', name: 'Net 30' }];

describe('CreateCommercialAccountComponent', () => {
  let fixture: ComponentFixture<CreateCommercialAccountComponent>;
  let component: CreateCommercialAccountComponent;

  const setup = async () => {
    await TestBed.configureTestingModule({
      imports: [CreateCommercialAccountComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(CreateCommercialAccountComponent);
    component = fixture.componentInstance;
  };

  const fillRequiredFields = () => {
    component.form.controls.legalName.setValue('Acme Tire Co');
    component.form.controls.defaultBillingTermsId.setValue('NET_30');
  };

  beforeEach(() => {
    crmServiceStub.listBillingTerms.mockReturnValue(of(TERMS));
  });

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('loads billing terms on init and moves from loading-terms to idle', async () => {
    await setup();
    expect(component.state()).toBe('loading-terms');
    fixture.detectChanges();

    expect(crmServiceStub.listBillingTerms).toHaveBeenCalled();
    expect(component.state()).toBe('idle');
    expect(component.billingTerms()).toEqual(TERMS);
  });

  it('routes a 403 terms load to access-denied, and any other failure to terms-error', async () => {
    crmServiceStub.listBillingTerms.mockReturnValue(throwError(() => ({ status: 403 })));
    await setup();
    fixture.detectChanges();
    expect(component.state()).toBe('access-denied');

    crmServiceStub.listBillingTerms.mockReturnValue(throwError(() => ({ status: 500 })));
    component.retryTermsLoad();
    expect(component.state()).toBe('terms-error');
  });

  it('does not submit an invalid form', async () => {
    await setup();
    fixture.detectChanges();
    component.submit();
    expect(crmServiceStub.checkCommercialAccountDuplicates).not.toHaveBeenCalled();
  });

  it('creates the account directly when the duplicate check finds none', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();

    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] } as DuplicateCheckResponse));
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-1', legalName: 'Acme Tire Co' }));

    component.submit();

    expect(crmServiceStub.createCommercialAccount).toHaveBeenCalledWith(
      expect.objectContaining({ legalName: 'Acme Tire Co', overrideDuplicate: false }),
    );
    expect(component.state()).toBe('success');
    expect(component.createdPartyId()).toBe('party-1');
  });

  it('surfaces duplicate candidates instead of creating when the check finds matches', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();

    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(
      of({ duplicates: [{ partyId: 'p-9', legalName: 'Acme Tires' }] } as DuplicateCheckResponse),
    );

    component.submit();

    expect(crmServiceStub.createCommercialAccount).not.toHaveBeenCalled();
    expect(component.state()).toBe('duplicates');
    expect(component.duplicates()).toHaveLength(1);
  });

  it('drives the checking state off a Subject, not a synchronous of()', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();

    const subject = new Subject<DuplicateCheckResponse>();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(subject.asObservable());

    component.submit();
    expect(component.state()).toBe('checking');
    expect(component.isChecking).toBe(true);

    subject.next({ duplicates: [] });
    subject.complete();
  });

  it('proceeds past duplicates with an override justification', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(
      of({ duplicates: [{ partyId: 'p-9', legalName: 'Acme Tires' }] }),
    );
    component.submit();
    expect(component.state()).toBe('duplicates');

    component.overrideForm.controls.justification.setValue('Different tax ID, confirmed by phone');
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-2', legalName: 'Acme Tire Co' }));

    component.proceedWithOverride();

    expect(crmServiceStub.createCommercialAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideDuplicate: true,
        overrideDuplicateJustification: 'Different tax ID, confirmed by phone',
      }),
    );
    expect(component.state()).toBe('success');
  });

  it('does not proceed past duplicates with a blank justification', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [{ partyId: 'p-9', legalName: 'X' }] }));
    component.submit();

    component.proceedWithOverride();

    expect(crmServiceStub.createCommercialAccount).not.toHaveBeenCalled();
  });

  it('cancelOverride() clears the duplicate list and returns to idle', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [{ partyId: 'p-9', legalName: 'X' }] }));
    component.submit();
    expect(component.state()).toBe('duplicates');

    component.cancelOverride();

    expect(component.state()).toBe('idle');
    expect(component.duplicates()).toEqual([]);
  });

  it('blocks account creation when the duplicate check fails', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(throwError(() => new Error('down')));

    component.submit();

    expect(crmServiceStub.createCommercialAccount).not.toHaveBeenCalled();
    expect(component.state()).toBe('error');
    expect(component.serverError()).toBe(enUS.CRM.CREATE_COMMERCIAL.ERROR.DUPLICATE_CHECK_FAILED);
  });

  it('routes a 403 create failure to access-denied', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(throwError(() => ({ status: 403 })));

    component.submit();

    expect(component.state()).toBe('access-denied');
  });

  it('surfaces the server message on a non-403 create failure, falling back to a translated key', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(
      throwError(() => ({ status: 500, error: { message: 'Tax ID already registered' } })),
    );

    component.submit();

    expect(component.state()).toBe('error');
    expect(component.serverError()).toBe('Tax ID already registered');
  });

  it('falls back to the translated create-failed message when the server sends none', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(throwError(() => ({ status: 500 })));

    component.submit();

    expect(component.serverError()).toContain('Account creation failed');
  });

  it('resets to a clean idle form on createAnother()', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-4', legalName: 'Acme Tire Co' }));
    component.submit();
    expect(component.state()).toBe('success');

    component.createAnother();

    expect(component.state()).toBe('idle');
    expect(component.createdPartyId()).toBeNull();
    expect(component.form.controls.legalName.value).toBe('');
  });

  it('navigates to the created party via viewParty()', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-5', legalName: 'Acme Tire Co' }));
    component.submit();

    component.viewParty();

    expect(routerStub.navigate).toHaveBeenCalledWith(['/app/crm/party', 'party-5']);
  });

  it('copyPartyId() reports unsupported clipboard environments without throwing', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-6', legalName: 'Acme Tire Co' }));
    component.submit();

    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    component.copyPartyId();

    expect(component.serverError()).toContain('not supported');
    expect(component.copied()).toBe(false);

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('copyPartyId() flips copied() on success and clears the flag after a timeout', async () => {
    vi.useFakeTimers();
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-7', legalName: 'Acme Tire Co' }));
    component.submit();

    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    component.copyPartyId();
    await vi.runAllTimersAsync();

    expect(writeText).toHaveBeenCalledWith('party-7');
    expect(component.copied()).toBe(false); // already reset by the 2s timeout

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    vi.useRealTimers();
  });

  it('copyPartyId() surfaces a clipboard write failure', async () => {
    await setup();
    fixture.detectChanges();
    fillRequiredFields();
    crmServiceStub.checkCommercialAccountDuplicates.mockReturnValue(of({ duplicates: [] }));
    crmServiceStub.createCommercialAccount.mockReturnValue(of({ partyId: 'party-8', legalName: 'Acme Tire Co' }));
    component.submit();

    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    component.copyPartyId();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.serverError()).toContain('Unable to copy');

    errSpy.mockRestore();
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('renders the access-denied panel with real i18n copy', async () => {
    crmServiceStub.listBillingTerms.mockReturnValue(throwError(() => ({ status: 403 })));
    await setup();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You do not have permission to create commercial accounts.');
  });
});
