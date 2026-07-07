import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PartyDetailComponent } from './party-detail.component';
import { CrmService } from '../../services/crm.service';

const PARTY_ID = '01960020-0000-7000-8000-00000000002b';

const crmServiceStub = {
  getParty: vi.fn(),
  getContactsWithRoles: vi.fn(),
  getCommunicationPreferences: vi.fn(),
  fetchByParty: vi.fn(),
};

const routerStub = {
  // Nav state captured at construction; overridden per test.
  getCurrentNavigation: vi.fn().mockReturnValue(null),
  navigate: vi.fn(),
};

describe('PartyDetailComponent', () => {
  let fixture: ComponentFixture<PartyDetailComponent>;

  const setup = async () => {
    crmServiceStub.getParty.mockReturnValue(of({ partyId: PARTY_ID, legalName: 'Albert Rogers' }));
    crmServiceStub.getContactsWithRoles.mockReturnValue(of([]));
    crmServiceStub.getCommunicationPreferences.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [PartyDetailComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ partyId: PARTY_ID }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PartyDetailComponent);
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    routerStub.getCurrentNavigation.mockReturnValue(null);
    TestBed.resetTestingModule();
  });

  it('shows the customer number carried via router state without fetching the snapshot', async () => {
    routerStub.getCurrentNavigation.mockReturnValue({ extras: { state: { customerNumber: 'CUST-PP-043' } } });
    await setup();

    expect(crmServiceStub.fetchByParty).not.toHaveBeenCalled();
    const cell = fixture.debugElement.query(By.css('[data-testid="customer-number"]'));
    expect(cell.nativeElement.textContent.trim()).toBe('CUST-PP-043');
  });

  it('falls back to the snapshot account number on direct navigation', async () => {
    crmServiceStub.fetchByParty.mockReturnValue(of({ account: { accountNumber: 'CUST-PP-099' } }));
    await setup();

    expect(crmServiceStub.fetchByParty).toHaveBeenCalledWith(PARTY_ID);
    const cell = fixture.debugElement.query(By.css('[data-testid="customer-number"]'));
    expect(cell.nativeElement.textContent.trim()).toBe('CUST-PP-099');
  });

  it('never renders the raw partyId UUID, and hides the row when no number resolves', async () => {
    crmServiceStub.fetchByParty.mockReturnValue(throwError(() => new Error('no snapshot')));
    await setup();

    expect(fixture.debugElement.query(By.css('[data-testid="customer-number"]'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(PARTY_ID);
  });
});
