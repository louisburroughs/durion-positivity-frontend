import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { CrmLandingPageComponent } from './crm-landing-page.component';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';
import { CrmService } from '../../services/crm.service';

describe('CrmLandingPageComponent', () => {
  let fixture: ComponentFixture<CrmLandingPageComponent>;
  let component: CrmLandingPageComponent;
  let router: Router;
  const bulkImportService = {
    getActiveJobDomains: vi.fn(),
  };
  const crmService = {
    searchParties: vi.fn(),
  };

  /** Finds a launch card by field name, throwing if absent. */
  const findLaunchCard = (field: string) => {
    const card = component.sections
      .flatMap((section) => section.cards)
      .find((candidate) => component.isLaunchCard(candidate) && candidate.field === field);

    if (!card || !component.isLaunchCard(card)) {
      throw new Error(`Launch card for field "${field}" was not found`);
    }

    return card;
  };

  beforeEach(async () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set()));
    crmService.searchParties.mockReturnValue(of({ parties: [] }));

    await TestBed.configureTestingModule({
      imports: [CrmLandingPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: bulkImportService },
        { provide: CrmService, useValue: crmService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(CrmLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('fetches and renders active import indicators for CRM import cards', () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set(['CUSTOMER', 'VEHICLE_FITMENT'])));
    fixture = TestBed.createComponent(CrmLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const activeIndicators = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.crm-card__active-import'),
    );

    expect(bulkImportService.getActiveJobDomains).toHaveBeenCalled();
    expect(activeIndicators).toHaveLength(2);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes hero CTA routes from the direct CRM directory cards', () => {
    expect(component.heroCustomersRoute).toBe('/app/crm/customers');
    expect(component.heroCreateCommercialRoute).toBe('/app/crm/create-commercial-account');
  });

  // ---------------------------------------------------------------------------
  // isLaunchCard()
  // ---------------------------------------------------------------------------

  describe('isLaunchCard()', () => {
    it('returns true for a card with kind: "launch"', () => {
      const launchCard = findLaunchCard('partyDetailId');
      expect(component.isLaunchCard(launchCard)).toBe(true);
    });

    it('returns false for a card with kind: "direct"', () => {
      // sections[0].cards[0] is the Customer List direct card
      const directCard = component.sections[0].cards[0];
      expect(component.isLaunchCard(directCard)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // updateLaunchValue()
  // ---------------------------------------------------------------------------

  describe('updateLaunchValue()', () => {
    it('updates the value signal for the given field', () => {
      component.updateLaunchValue('partyDetailId', 'party-001');
      expect(component.launchValue('partyDetailId')).toBe('party-001');
    });

    it('clears any existing error for the field', async () => {
      // Trigger validation error with empty value
      await component.openLaunch(findLaunchCard('partyDetailId'));
      expect(component.launchError('partyDetailId')).not.toBeNull();

      component.updateLaunchValue('partyDetailId', 'party-001');

      expect(component.launchError('partyDetailId')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // launchValue() / launchError()
  // ---------------------------------------------------------------------------

  describe('launchValue() / launchError()', () => {
    it('returns an empty string before any value is set', () => {
      expect(component.launchValue('partyDetailId')).toBe('');
    });

    it('returns null for launchError when no error is set', () => {
      expect(component.launchError('partyDetailId')).toBeNull();
    });

    it('returns the updated value after updateLaunchValue', () => {
      component.updateLaunchValue('contactsPartyId', 'cust-42');
      expect(component.launchValue('contactsPartyId')).toBe('cust-42');
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() — empty input (validation path)
  // ---------------------------------------------------------------------------

  describe('openLaunch() — empty input', () => {
    it('sets launchErrors for the field when value is empty', async () => {
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.launchError('partyDetailId')).toBe('CRM.LANDING.ERROR.REQUIRED_IDENTIFIER');
    });

    it('does not call router.navigate when value is empty', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate');

      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('state remains "ready" when value is empty', async () => {
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.state()).toBe('ready');
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() — successful navigation
  // ---------------------------------------------------------------------------

  describe('openLaunch() — successful navigation', () => {
    it('resets state to "ready" after navigation resolves true', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.updateLaunchValue('partyDetailId', 'party-123');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.state()).toBe('ready');
    });

    it('clears activeLaunchField after navigation resolves true', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.updateLaunchValue('partyDetailId', 'party-123');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.activeLaunchField()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() — failed navigation (returns false) — ADR-0031 order verified
  // ---------------------------------------------------------------------------

  describe('openLaunch() — navigation resolves false', () => {
    it('sets state to "error"', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(false);

      component.updateLaunchValue('partyDetailId', 'party-123');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      // ADR-0031: state must be 'error' (set before errorKey in source)
      expect(component.state()).toBe('error');
    });

    it('sets errorKey to CRM.LANDING.ERROR.NAVIGATE', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(false);

      component.updateLaunchValue('partyDetailId', 'party-123');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.errorKey()).toBe('CRM.LANDING.ERROR.NAVIGATE');
    });

    it('clears activeLaunchField', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(false);

      component.updateLaunchValue('partyDetailId', 'party-123');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.activeLaunchField()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() — navigation throws
  // ---------------------------------------------------------------------------

  describe('openLaunch() — navigation throws', () => {
    it('sets state to "error"', async () => {
      vi.spyOn(router, 'navigate').mockRejectedValue(new Error('navigation failed'));

      component.updateLaunchValue('partyDetailId', 'party-456');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.state()).toBe('error');
    });

    it('sets errorKey to CRM.LANDING.ERROR.NAVIGATE', async () => {
      vi.spyOn(router, 'navigate').mockRejectedValue(new Error('navigation failed'));

      component.updateLaunchValue('partyDetailId', 'party-456');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.errorKey()).toBe('CRM.LANDING.ERROR.NAVIGATE');
    });

    it('clears activeLaunchField on throw', async () => {
      vi.spyOn(router, 'navigate').mockRejectedValue(new Error('navigation failed'));

      component.updateLaunchValue('partyDetailId', 'party-456');
      await component.openLaunch(findLaunchCard('partyDetailId'));

      expect(component.activeLaunchField()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // router command builders — spot checks
  // ---------------------------------------------------------------------------

  it('builds the expected router commands for the party detail guided launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('partyDetailId', 'party-999');
    await component.openLaunch(findLaunchCard('partyDetailId'));

    expect(navigateSpy).toHaveBeenCalledWith(['/app', 'crm', 'party', 'party-999']);
  });

  it('builds the expected router commands for the add-vehicle guided launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('addVehiclePartyId', 'party-001');
    await component.openLaunch(findLaunchCard('addVehiclePartyId'));

    expect(navigateSpy).toHaveBeenCalledWith([
      '/app',
      'crm',
      'party',
      'party-001',
      'add-vehicle',
    ]);
  });

  it('builds the expected router commands for the billing-rules guided launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('billingRulesPartyId', 'cust-5');
    await component.openLaunch(findLaunchCard('billingRulesPartyId'));

    expect(navigateSpy).toHaveBeenCalledWith([
      '/app',
      'crm',
      'party',
      'cust-5',
      'billing-rules',
    ]);
  });

  // ---------------------------------------------------------------------------
  // Customer search typeahead
  // ---------------------------------------------------------------------------
  describe('customer typeahead', () => {
    it('queries CrmService.searchParties after debounce and stores suggestions', async () => {
      crmService.searchParties.mockReturnValue(
        of({ parties: [{ partyId: 'p-1', legalName: 'Acme Co', customerNumber: 'C100' }] }),
      );

      component.onCustomerInput('partyDetailId', 'acme');
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(crmService.searchParties).toHaveBeenCalledWith('acme');
      expect(component.customerSuggestions('partyDetailId')).toHaveLength(1);
      expect(component.isFieldOpen('partyDetailId')).toBe(true);
    });

    it('does not search for queries shorter than two characters', async () => {
      crmService.searchParties.mockClear();

      component.onCustomerInput('partyDetailId', 'a');
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(crmService.searchParties).not.toHaveBeenCalled();
    });

    it('typing clears any previously resolved party', () => {
      component.updateLaunchValue('partyDetailId', 'p-1');
      component.onCustomerInput('partyDetailId', 'new search');

      expect(component.launchValue('partyDetailId')).toBe('');
      expect(component.launchQuery('partyDetailId')).toBe('new search');
    });

    it('selecting a customer resolves the partyId and shows a readable label', () => {
      component.selectCustomer('partyDetailId', {
        partyId: 'p-9',
        legalName: 'Globex',
        customerNumber: 'C900',
      });

      expect(component.launchValue('partyDetailId')).toBe('p-9');
      expect(component.launchQuery('partyDetailId')).toBe('Globex (#C900)');
      expect(component.isFieldOpen('partyDetailId')).toBe(false);
    });

    it('navigates with the resolved partyId after a customer is selected', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.selectCustomer('snapshotPartyId', { partyId: 'p-7', legalName: 'Initech' });
      await component.openLaunch(findLaunchCard('snapshotPartyId'));

      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'crm', 'crm-snapshot', 'p-7']);
    });
  });
});
