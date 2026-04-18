import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AccountingLandingPageComponent } from './accounting-landing-page.component';

describe('AccountingLandingPageComponent', () => {
  let fixture: ComponentFixture<AccountingLandingPageComponent>;
  let component: AccountingLandingPageComponent;
  let router: Router;

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
    await TestBed.configureTestingModule({
      imports: [AccountingLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AccountingLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes hero CTA routes from the direct accounting cards', () => {
    expect(component.heroEventsRoute).toBe('/app/accounting/events');
    expect(component.heroPostingRulesRoute).toBe('/app/accounting/posting-rules');
  });

  it('computes correct page counts from sections', () => {
    expect(component.totalPageCount).toBe(component.directLinkCount + component.guidedLinkCount);
    expect(component.directLinkCount).toBeGreaterThan(0);
    expect(component.guidedLinkCount).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // isLaunchCard()
  // ---------------------------------------------------------------------------

  describe('isLaunchCard()', () => {
    it('returns true for a card with kind: "launch"', () => {
      const launchCard = findLaunchCard('eventId');
      expect(component.isLaunchCard(launchCard)).toBe(true);
    });

    it('returns false for a card with kind: "direct"', () => {
      const directCard = component.sections[0].cards[0];
      expect(component.isLaunchCard(directCard)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // updateLaunchValue()
  // ---------------------------------------------------------------------------

  describe('updateLaunchValue()', () => {
    it('updates the launch value for a given field', () => {
      component.updateLaunchValue('eventId', 'abc-123');
      expect(component.launchValue('eventId')).toBe('abc-123');
    });

    it('clears any existing error for the updated field', () => {
      component['launchErrors'].set({ eventId: 'ACCOUNTING.LANDING.ERROR.REQUIRED_IDENTIFIER' });
      component.updateLaunchValue('eventId', 'abc-123');
      expect(component.launchError('eventId')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – validation
  // ---------------------------------------------------------------------------

  describe('openLaunch() validation', () => {
    it('sets an inline field error when the identifier is blank', async () => {
      const card = findLaunchCard('eventId');
      component.updateLaunchValue('eventId', '');
      await component.openLaunch(card);
      expect(component.launchError('eventId')).toBe('ACCOUNTING.LANDING.ERROR.REQUIRED_IDENTIFIER');
      expect(component.state()).toBe('ready');
    });

    it('sets an inline field error when the identifier is whitespace-only', async () => {
      const card = findLaunchCard('ruleSetId');
      component.updateLaunchValue('ruleSetId', '   ');
      await component.openLaunch(card);
      expect(component.launchError('ruleSetId')).toBe('ACCOUNTING.LANDING.ERROR.REQUIRED_IDENTIFIER');
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – successful navigation
  // ---------------------------------------------------------------------------

  describe('openLaunch() navigation', () => {
    it('navigates to the event detail route for a valid eventId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('eventId');
      component.updateLaunchValue('eventId', 'evt-uuid-001');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'accounting', 'events', 'evt-uuid-001']);
      expect(component.state()).toBe('ready');
    });

    it('navigates to the posting-rules detail route for a valid ruleSetId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('ruleSetId');
      component.updateLaunchValue('ruleSetId', 'ruleset-42');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'accounting', 'posting-rules', 'ruleset-42']);
    });

    it('navigates to the vendor payment detail route for a valid vendorPaymentId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('vendorPaymentId');
      component.updateLaunchValue('vendorPaymentId', 'vp-99');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'accounting', 'vendor-payments', 'vp-99']);
    });

    it('navigates to the invoice payment status route for a valid invoicePaymentId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('invoicePaymentId');
      component.updateLaunchValue('invoicePaymentId', 'inv-55');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith([
        '/app', 'accounting', 'invoices', 'inv-55', 'payment-status',
      ]);
    });

    it('navigates to the credit memo detail route for a valid creditMemoId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('creditMemoId');
      component.updateLaunchValue('creditMemoId', 'cm-007');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'accounting', 'credit-memos', 'cm-007']);
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – navigation failure
  // ---------------------------------------------------------------------------

  describe('openLaunch() navigation failure', () => {
    it('sets error state when navigate() returns false', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(false);
      const card = findLaunchCard('eventId');
      component.updateLaunchValue('eventId', 'evt-uuid-002');
      await component.openLaunch(card);
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.LANDING.ERROR.NAVIGATE');
    });

    it('sets error state when navigate() rejects', async () => {
      vi.spyOn(router, 'navigate').mockRejectedValue(new Error('nav error'));
      const card = findLaunchCard('eventId');
      component.updateLaunchValue('eventId', 'evt-uuid-003');
      await component.openLaunch(card);
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.LANDING.ERROR.NAVIGATE');
    });
  });
});
