import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

import { WorkexecLandingPageComponent } from './workexec-landing-page.component';
import { WorkexecService } from '../../services/workexec.service';

describe('WorkexecLandingPageComponent', () => {
  let component: WorkexecLandingPageComponent;
  let fixture: ComponentFixture<WorkexecLandingPageComponent>;
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

  const workexecStub = {
    searchEstimates: vi.fn().mockReturnValue(of([])),
    searchWorkorders: vi.fn().mockReturnValue(of([])),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkexecLandingPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: workexecStub },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(WorkexecLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have initial state of ready', () => {
    expect(component.state()).toBe('ready');
  });

  it('exposes hero CTA routes from the direct estimate cards', () => {
    expect(component.heroEstimateListRoute).toBe('/app/workexec/estimate-list');
    expect(component.heroEstimateNewRoute).toBe('/app/workexec/estimates/new');
  });

  it('computes correct page counts from sections', () => {
    expect(component.totalPageCount).toBe(component.directLinkCount + component.guidedLinkCount);
    expect(component.directLinkCount).toBeGreaterThan(0);
    expect(component.guidedLinkCount).toBeGreaterThan(0);
  });

  it('should expose four landing sections', () => {
    expect(component.sections.length).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // isLaunchCard()
  // ---------------------------------------------------------------------------

  describe('isLaunchCard()', () => {
    it('returns true for a card with kind: "launch"', () => {
      const launchCard = findLaunchCard('estimateId');
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
      component.updateLaunchValue('estimateId', 'EST-001');
      expect(component.launchValue('estimateId')).toBe('EST-001');
    });

    it('clears any existing error for the updated field', () => {
      component['launchErrors'].set({ estimateId: 'WORKEXEC.LANDING.ERROR.REQUIRED_IDENTIFIER' });
      component.updateLaunchValue('estimateId', 'EST-001');
      expect(component.launchError('estimateId')).toBeNull();
    });

    it('returns null for a field with no error', () => {
      expect(component.launchError('estimateSummaryId')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – validation
  // ---------------------------------------------------------------------------

  describe('openLaunch() validation', () => {
    it('sets an inline field error when the identifier is blank', async () => {
      const card = findLaunchCard('estimateId');
      component.updateLaunchValue('estimateId', '');
      await component.openLaunch(card);
      expect(component.launchError('estimateId')).toBe('WORKEXEC.LANDING.ERROR.REQUIRED_IDENTIFIER');
      expect(component.state()).toBe('ready');
    });

    it('sets an inline field error when the identifier is whitespace-only', async () => {
      const card = findLaunchCard('workorderId');
      component.updateLaunchValue('workorderId', '   ');
      await component.openLaunch(card);
      expect(component.launchError('workorderId')).toBe('WORKEXEC.LANDING.ERROR.REQUIRED_IDENTIFIER');
    });

    it('does not navigate when identifier is blank', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('estimateId');
      component.updateLaunchValue('estimateId', '');
      await component.openLaunch(card);
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – successful navigation
  // ---------------------------------------------------------------------------

  describe('openLaunch() navigation', () => {
    it('navigates to estimate detail for a valid estimateId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('estimateId');
      component.updateLaunchValue('estimateId', 'EST-123');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'estimates', 'EST-123']);
      expect(component.state()).toBe('ready');
    });

    it('navigates to estimate parts for a valid estimatePartsId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('estimatePartsId');
      component.updateLaunchValue('estimatePartsId', 'EST-5');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'estimates', 'EST-5', 'parts']);
    });

    it('navigates to estimate labor for a valid estimateLaborId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('estimateLaborId');
      component.updateLaunchValue('estimateLaborId', 'EST-7');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'estimates', 'EST-7', 'labor']);
    });

    it('navigates to estimate summary for a valid estimateSummaryId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('estimateSummaryId');
      component.updateLaunchValue('estimateSummaryId', 'EST-8');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'estimates', 'EST-8', 'summary']);
    });

    it('navigates to approval submit for a valid approvalSubmitId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('approvalSubmitId');
      component.updateLaunchValue('approvalSubmitId', 'EST-7');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'estimates', 'EST-7', 'approval', 'submit']);
    });

    it('navigates to workorder detail for a valid workorderId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('workorderId');
      component.updateLaunchValue('workorderId', 'WO-42');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'workorders', 'WO-42']);
    });

    it('navigates to workorder assign for a valid workorderAssignId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('workorderAssignId');
      component.updateLaunchValue('workorderAssignId', 'WO-42');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'workorders', 'WO-42', 'assign']);
    });

    it('navigates to workorder finalize for a valid workorderFinalizeId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('workorderFinalizeId');
      component.updateLaunchValue('workorderFinalizeId', 'WO-99');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'workorders', 'WO-99', 'finalize']);
    });

    it('navigates to invoice finalization for a valid workorderInvoiceId', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const card = findLaunchCard('workorderInvoiceId');
      component.updateLaunchValue('workorderInvoiceId', 'WO-11');
      await component.openLaunch(card);
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'workorders', 'WO-11', 'invoice-finalization']);
    });
  });

  // ---------------------------------------------------------------------------
  // openLaunch() – navigation failure
  // ---------------------------------------------------------------------------

  describe('openLaunch() navigation failure', () => {
    it('sets error state when navigate() returns false', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(false);
      const card = findLaunchCard('workorderId');
      component.updateLaunchValue('workorderId', 'WO-bad');
      await component.openLaunch(card);
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('WORKEXEC.LANDING.ERROR.NAVIGATE');
    });

    it('sets error state when navigate() rejects', async () => {
      vi.spyOn(router, 'navigate').mockRejectedValue(new Error('nav error'));
      const card = findLaunchCard('estimateId');
      component.updateLaunchValue('estimateId', 'EST-bad');
      await component.openLaunch(card);
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('WORKEXEC.LANDING.ERROR.NAVIGATE');
    });
  });

  // ---------------------------------------------------------------------------
  // Finders typeahead navigation
  // ---------------------------------------------------------------------------

  describe('Finders selection', () => {
    it('navigates to the estimate summary when an estimate is selected', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onEstimateSelected('e1');
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'estimates', 'e1', 'summary']);
    });

    it('navigates to the workorder when a workorder is selected', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onWorkorderSelected('w1');
      expect(navigateSpy).toHaveBeenCalledWith(['/app', 'workexec', 'workorders', 'w1']);
    });
  });
});


