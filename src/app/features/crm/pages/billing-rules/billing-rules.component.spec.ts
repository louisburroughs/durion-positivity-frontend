import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { BillingRulesComponent } from './billing-rules.component';
import { CrmService } from '../../services/crm.service';
import { BillingRules } from '../../models/crm.models';

const PARTY_ID = '01960020-0000-7000-8000-00000000002b';

const crmServiceStub = {
  getBillingRules: vi.fn(),
  upsertBillingRules: vi.fn(),
};

const routerStub = { navigate: vi.fn() };

describe('BillingRulesComponent', () => {
  let fixture: ComponentFixture<BillingRulesComponent>;
  let component: BillingRulesComponent;

  const setup = async () => {
    await TestBed.configureTestingModule({
      imports: [BillingRulesComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ partyId: PARTY_ID }) } } },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(BillingRulesComponent);
    component = fixture.componentInstance;
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('loads billing rules on init and renders the summary', async () => {
    const rules: BillingRules = { requirePo: true, paymentTerms: 'NET_30', creditLimit: 5000 };
    crmServiceStub.getBillingRules.mockReturnValue(of(rules));
    await setup();
    fixture.detectChanges();

    expect(crmServiceStub.getBillingRules).toHaveBeenCalledWith(PARTY_ID);
    expect(component.state()).toBe('ready');
    const summary = fixture.debugElement.query(By.css('.billing-rules__summary'));
    expect(summary.nativeElement.textContent).toContain('NET_30');
    expect(summary.nativeElement.textContent).toContain('5000');
  });

  it('drives loading, then ready, off a Subject rather than a synchronous of()', async () => {
    const subject = new Subject<BillingRules>();
    crmServiceStub.getBillingRules.mockReturnValue(subject.asObservable());
    await setup();
    fixture.detectChanges();

    expect(component.state()).toBe('loading');
    expect(component.pageState()).toBe('loading');

    subject.next({ requirePo: false, paymentTerms: 'DUE_ON_RECEIPT' });
    subject.complete();
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.pageState()).toBe('ready');
  });

  it('routes a 403 load failure to the access-denied page state', async () => {
    crmServiceStub.getBillingRules.mockReturnValue(throwError(() => ({ status: 403 })));
    await setup();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('CRM.BILLING_RULES.ERROR.FORBIDDEN');
    expect(component.pageState()).toBe('access-denied');
    const banner = fixture.debugElement.query(By.css('[role="alert"]'));
    expect(banner.nativeElement.textContent).toContain('do not have permission');
  });

  it('routes a non-403 load failure to the generic error page state with a retry', async () => {
    crmServiceStub.getBillingRules.mockReturnValue(throwError(() => ({ status: 500 })));
    await setup();
    fixture.detectChanges();

    expect(component.pageState()).toBe('error');
    expect(component.errorKey()).toBe('CRM.BILLING_RULES.ERROR.LOAD');

    crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: false, paymentTerms: '' }));
    const retry = fixture.debugElement.query(By.css('.billing-rules__save'));
    retry.nativeElement.click();
    fixture.detectChanges();

    expect(crmServiceStub.getBillingRules).toHaveBeenCalledTimes(2);
    expect(component.pageState()).toBe('ready');
  });

  it('saves the edited fields and clears the save error on success', async () => {
    crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: false, paymentTerms: 'NET_15' }));
    await setup();
    fixture.detectChanges();

    crmServiceStub.upsertBillingRules.mockReturnValue(of({ requirePo: true, paymentTerms: 'NET_45', creditLimit: 1000 }));
    component.saveBillingRules({ requirePo: true, paymentTerms: 'NET_45', creditLimit: 1000 });

    expect(crmServiceStub.upsertBillingRules).toHaveBeenCalledWith(PARTY_ID, {
      requirePo: true,
      paymentTerms: 'NET_45',
      creditLimit: 1000,
    });
    expect(component.isSaving()).toBe(false);
    expect(component.billingRules()?.paymentTerms).toBe('NET_45');
    expect(component.state()).toBe('ready');
  });

  it('surfaces a save failure without discarding the loaded rules', async () => {
    const loaded: BillingRules = { requirePo: false, paymentTerms: 'NET_15' };
    crmServiceStub.getBillingRules.mockReturnValue(of(loaded));
    await setup();
    fixture.detectChanges();

    crmServiceStub.upsertBillingRules.mockReturnValue(throwError(() => new Error('boom')));
    component.saveBillingRules({ paymentTerms: 'NET_60' });
    fixture.detectChanges();

    // ADR-0031 §1: state moves into 'error' before errorKey; a save failure routes
    // the whole page (not just the form) into pageState() === 'error', so the
    // signal-level errorKey is save-specific while the rendered banner is the
    // page's one generic error section with a reload-style retry.
    expect(component.isSaving()).toBe(false);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('CRM.BILLING_RULES.ERROR.SAVE');
    expect(component.billingRules()).toEqual(loaded);
    expect(component.pageState()).toBe('error');
    const banner = fixture.debugElement.query(By.css('.billing-rules__error[role="alert"]'));
    expect(banner.nativeElement.textContent).toContain('Unable to load billing rules');
    expect(banner.query(By.css('button'))).toBeTruthy();
  });

  it('ignores a second save while one is already in flight', async () => {
    crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: false, paymentTerms: 'NET_15' }));
    await setup();
    fixture.detectChanges();

    const subject = new Subject<BillingRules>();
    crmServiceStub.upsertBillingRules.mockReturnValue(subject.asObservable());
    component.saveBillingRules({ paymentTerms: 'NET_30' });
    expect(component.isSaving()).toBe(true);

    component.saveBillingRules({ paymentTerms: 'NET_90' });
    expect(crmServiceStub.upsertBillingRules).toHaveBeenCalledTimes(1);
  });

  it('navigates back to the party on backToParty()', async () => {
    crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: false, paymentTerms: '' }));
    await setup();
    fixture.detectChanges();

    component.backToParty();

    expect(routerStub.navigate).toHaveBeenCalledWith(['/app/crm/party', PARTY_ID]);
  });
});
