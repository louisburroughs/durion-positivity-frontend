import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { vi, describe, beforeEach, it, expect } from 'vitest';

import { ShopmgmtLandingPageComponent } from './shopmgmt-landing-page.component';

describe('ShopmgmtLandingPageComponent', () => {
  let component: ShopmgmtLandingPageComponent;
  let fixture: ComponentFixture<ShopmgmtLandingPageComponent>;
  let router: Router;

  const findLaunchCard = (field: string) => {
    const card = component.sections
      .flatMap(section => section.cards)
      .find(candidate => component.isLaunchCard(candidate) && candidate.field === field);

    if (!card || !component.isLaunchCard(card)) {
      throw new Error(`Launch card for field "${field}" was not found`);
    }

    return card;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShopmgmtLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ShopmgmtLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have initial state of ready', () => {
    expect(component.state()).toBe('ready');
  });

  it('exposes hero CTA routes from the direct dispatch cards', () => {
    expect(component.heroDispatchRoute).toBe('/app/shopmgmt/dispatch-board');
    expect(component.heroScheduleRoute).toBe('/app/shopmgmt/schedule');
  });

  it('computes correct page counts from sections', () => {
    expect(component.totalPageCount).toBe(component.directLinkCount + component.guidedLinkCount);
    expect(component.directLinkCount).toBeGreaterThan(0);
    expect(component.guidedLinkCount).toBeGreaterThan(0);
  });

  it('should expose three landing sections', () => {
    expect(component.sections.length).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // isLaunchCard()
  // ---------------------------------------------------------------------------

  describe('isLaunchCard()', () => {
    it('returns true for a card with kind: "launch"', () => {
      const launchCard = findLaunchCard('appointmentAssignId');
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
      component.updateLaunchValue('appointmentAssignId', 'APT-001');
      expect(component.launchValue('appointmentAssignId')).toBe('APT-001');
    });

    it('clears any existing error for the updated field', () => {
      component['launchErrors'].set({ appointmentAssignId: 'SHOPMGMT.LANDING.ERROR.REQUIRED_IDENTIFIER' });
      component.updateLaunchValue('appointmentAssignId', 'APT-001');
      expect(component.launchError('appointmentAssignId')).toBeNull();
    });

    it('returns null for a field with no error', () => {
      expect(component.launchError('appointmentEditId')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – validation
  // ---------------------------------------------------------------------------

  describe('openLaunch() validation', () => {
    it('sets an inline field error when the identifier is blank', async () => {
      const card = findLaunchCard('appointmentAssignId');
      component.updateLaunchValue('appointmentAssignId', '');
      await component.openLaunch(card);
      expect(component.launchError('appointmentAssignId')).toBe('SHOPMGMT.LANDING.ERROR.REQUIRED_IDENTIFIER');
      expect(component.state()).toBe('ready');
    });

    it('sets an inline field error when the identifier is whitespace-only', async () => {
      const card = findLaunchCard('appointmentRescheduleId');
      component.updateLaunchValue('appointmentRescheduleId', '   ');
      await component.openLaunch(card);
      expect(component.launchError('appointmentRescheduleId')).toBe('SHOPMGMT.LANDING.ERROR.REQUIRED_IDENTIFIER');
    });

    it('does not navigate when identifier is blank', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('appointmentAssignId');
      component.updateLaunchValue('appointmentAssignId', '');
      await component.openLaunch(card);
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – successful navigation
  // ---------------------------------------------------------------------------

  describe('openLaunch() navigation', () => {
    it('navigates to appointment assignments for a valid appointmentAssignId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('appointmentAssignId');
      component.updateLaunchValue('appointmentAssignId', 'APT-123');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'shopmgmt', 'appointments', 'APT-123', 'assignments']);
      expect(component.state()).toBe('ready');
    });

    it('navigates to appointment reschedule for a valid appointmentRescheduleId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('appointmentRescheduleId');
      component.updateLaunchValue('appointmentRescheduleId', 'APT-42');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'shopmgmt', 'appointments', 'APT-42', 'reschedule']);
    });

    it('navigates to appointment edit for a valid appointmentEditId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('appointmentEditId');
      component.updateLaunchValue('appointmentEditId', 'APT-7');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'shopmgmt', 'appointments', 'APT-7', 'edit']);
    });

    it('navigates to appointment override-conflict for a valid appointmentOverrideId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('appointmentOverrideId');
      component.updateLaunchValue('appointmentOverrideId', 'APT-9');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'shopmgmt', 'appointments', 'APT-9', 'override-conflict']);
    });

    it('navigates to appointment dispatch-assign for a valid appointmentDispatchAssignId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('appointmentDispatchAssignId');
      component.updateLaunchValue('appointmentDispatchAssignId', 'APT-55');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'shopmgmt', 'appointments', 'APT-55', 'dispatch-assign']);
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – navigation failure
  // ---------------------------------------------------------------------------

  describe('openLaunch() navigation failure', () => {
    it('sets error state when navigate() returns false', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(false);
      const card = findLaunchCard('appointmentAssignId');
      component.updateLaunchValue('appointmentAssignId', 'APT-bad');
      await component.openLaunch(card);
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('SHOPMGMT.LANDING.ERROR.NAVIGATE');
    });

    it('sets error state when navigate() rejects', async () => {
      vi.spyOn(router, 'navigate').mockRejectedValue(new Error('nav error'));
      const card = findLaunchCard('appointmentRescheduleId');
      component.updateLaunchValue('appointmentRescheduleId', 'APT-bad');
      await component.openLaunch(card);
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('SHOPMGMT.LANDING.ERROR.NAVIGATE');
    });
  });
});
