import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { MergePartiesComponent } from './merge-parties.component';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';

const crmServiceStub = { searchParties: vi.fn(), mergeParties: vi.fn() };
const routerStub = { navigate: vi.fn() };

const partyA: PartyDetail = { partyId: 'party-a', legalName: 'Acme Tires' };
const partyB: PartyDetail = { partyId: 'party-b', legalName: 'Acme Tire Co' };
const mergedParty: PartyDetail = { partyId: 'party-c', legalName: 'Old Acme', mergedIntoPartyId: 'party-a' } as PartyDetail;

describe('MergePartiesComponent', () => {
  let fixture: ComponentFixture<MergePartiesComponent>;
  let component: MergePartiesComponent;

  const setup = async () => {
    await TestBed.configureTestingModule({
      imports: [MergePartiesComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(MergePartiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  describe('search()', () => {
    it('requires at least one search field', async () => {
      await setup();
      component.search();

      expect(component.searchState()).toBe('idle');
      expect(component.searchError()).toBe('Enter at least one search field.');
      expect(crmServiceStub.searchParties).not.toHaveBeenCalled();
    });

    it('joins the populated fields into a single query', async () => {
      await setup();
      component.searchForm.setValue({ name: 'Acme', email: '', phone: ' 555-1234 ' });
      crmServiceStub.searchParties.mockReturnValue(of({ parties: [partyA] }));

      component.search();

      expect(crmServiceStub.searchParties).toHaveBeenCalledWith('Acme 555-1234');
      expect(component.searchState()).toBe('ready');
      expect(component.searchResults()).toEqual([partyA]);
    });

    it('reaches empty when the search returns no rows', async () => {
      await setup();
      component.searchForm.controls.name.setValue('Nobody');
      crmServiceStub.searchParties.mockReturnValue(of({ parties: [] }));

      component.search();

      expect(component.searchState()).toBe('empty');
    });

    it('drives loading off a Subject rather than a synchronous of()', async () => {
      await setup();
      component.searchForm.controls.name.setValue('Acme');
      const subject = new Subject<{ parties: PartyDetail[] }>();
      crmServiceStub.searchParties.mockReturnValue(subject.asObservable());

      component.search();
      expect(component.searchState()).toBe('loading');

      subject.next({ parties: [partyA] });
      subject.complete();
      expect(component.searchState()).toBe('ready');
    });

    it('routes a 403 to access-denied with the forbidden message', async () => {
      await setup();
      component.searchForm.controls.name.setValue('Acme');
      crmServiceStub.searchParties.mockReturnValue(throwError(() => ({ status: 403 })));

      component.search();

      expect(component.searchState()).toBe('access-denied');
      expect(component.searchError()).toBe("You don't have permission to search parties.");
    });

    it('routes a non-403 failure to a generic error with no error message', async () => {
      await setup();
      component.searchForm.controls.name.setValue('Acme');
      crmServiceStub.searchParties.mockReturnValue(throwError(() => ({ status: 500 })));

      component.search();

      expect(component.searchState()).toBe('error');
      expect(component.searchError()).toBeNull();
    });
  });

  describe('selection', () => {
    it('selects and deselects a party, up to two at a time', async () => {
      await setup();
      component.toggleSelect(partyA);
      expect(component.isSelected('party-a')).toBe(true);
      expect(component.canContinue()).toBe(false);

      component.toggleSelect(partyB);
      expect(component.canContinue()).toBe(true);

      const partyThird: PartyDetail = { partyId: 'party-z', legalName: 'Zeta' };
      component.toggleSelect(partyThird);
      expect(component.isSelected('party-z')).toBe(false);
      expect(component.selectedParties()).toHaveLength(2);

      component.toggleSelect(partyA);
      expect(component.isSelected('party-a')).toBe(false);
      expect(component.selectedParties()).toHaveLength(1);
    });

    it('refuses to select a party that has already been merged away', async () => {
      await setup();
      component.toggleSelect(mergedParty);
      expect(component.selectedParties()).toEqual([]);
    });
  });

  describe('continueToConfirm() / backToSearch()', () => {
    it('does nothing until exactly two parties are selected', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.continueToConfirm();
      expect(component.step()).toBe('search');
    });

    it('moves to confirm and defaults the survivor to the first selected party', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);

      component.continueToConfirm();

      expect(component.step()).toBe('confirm');
      expect(component.survivorPartyId()).toBe('party-a');
    });

    it('backToSearch() resets the confirm form and error', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);
      component.continueToConfirm();
      component.confirmForm.controls.justification.setValue('reason');
      component.confirmError.set('boom');

      component.backToSearch();

      expect(component.step()).toBe('search');
      expect(component.confirmForm.controls.justification.value).toBe('');
      expect(component.confirmError()).toBeNull();
    });
  });

  describe('setSurvivor()', () => {
    it('updates the chosen survivor', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);
      component.continueToConfirm();

      component.setSurvivor('party-b');

      expect(component.survivorPartyId()).toBe('party-b');
    });
  });

  describe('submitMerge()', () => {
    const arrangeConfirmStep = () => {
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);
      component.continueToConfirm();
      component.confirmForm.setValue({ justification: 'Duplicate customer record', acknowledged: true });
    };

    it('is a no-op while the confirm form is invalid', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);
      component.continueToConfirm();

      component.submitMerge();

      expect(crmServiceStub.mergeParties).not.toHaveBeenCalled();
    });

    it('merges the losing party into the survivor and reaches success', async () => {
      await setup();
      arrangeConfirmStep();
      crmServiceStub.mergeParties.mockReturnValue(
        of({ survivorPartyId: 'party-a', losingPartyId: 'party-b', status: 'COMPLETED' }),
      );

      component.submitMerge();

      expect(crmServiceStub.mergeParties).toHaveBeenCalledWith('party-a', {
        survivorPartyId: 'party-a',
        losingPartyId: 'party-b',
        justification: 'Duplicate customer record',
      });
      expect(component.step()).toBe('success');
      expect(component.confirmPending()).toBe(false);
      expect(component.mergeResult()?.status).toBe('COMPLETED');
    });

    it('ignores a resubmit while one merge is already pending', async () => {
      await setup();
      arrangeConfirmStep();
      const subject = new Subject<{ survivorPartyId: string; losingPartyId: string }>();
      crmServiceStub.mergeParties.mockReturnValue(subject.asObservable());

      component.submitMerge();
      expect(component.confirmPending()).toBe(true);
      component.submitMerge();

      expect(crmServiceStub.mergeParties).toHaveBeenCalledTimes(1);
      subject.next({ survivorPartyId: 'party-a', losingPartyId: 'party-b' });
      subject.complete();
    });

    it('surfaces the server message on failure and clears the pending flag', async () => {
      await setup();
      arrangeConfirmStep();
      crmServiceStub.mergeParties.mockReturnValue(
        throwError(() => ({ error: { message: 'Survivor already merged' } })),
      );

      component.submitMerge();

      expect(component.confirmError()).toBe('Survivor already merged');
      expect(component.confirmPending()).toBe(false);
      expect(component.step()).toBe('confirm');
    });

    it('falls back to a translated message when the server sends none', async () => {
      await setup();
      arrangeConfirmStep();
      crmServiceStub.mergeParties.mockReturnValue(throwError(() => new Error('boom')));

      component.submitMerge();

      expect(component.confirmError()).toBe('Merge failed.');
    });
  });

  describe('viewSurvivor() / startNewMerge() / back()', () => {
    it('viewSurvivor() is a no-op until a merge has completed', async () => {
      await setup();
      component.viewSurvivor();
      expect(routerStub.navigate).not.toHaveBeenCalled();
    });

    it('viewSurvivor() navigates to the merged survivor', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);
      component.continueToConfirm();
      component.confirmForm.setValue({ justification: 'dup', acknowledged: true });
      crmServiceStub.mergeParties.mockReturnValue(of({ survivorPartyId: 'party-a', losingPartyId: 'party-b' }));
      component.submitMerge();

      component.viewSurvivor();

      expect(routerStub.navigate).toHaveBeenCalledWith(['/app/crm/party', 'party-a']);
    });

    it('startNewMerge() clears every piece of merge/search state', async () => {
      await setup();
      component.toggleSelect(partyA);
      component.toggleSelect(partyB);
      component.continueToConfirm();
      component.confirmForm.setValue({ justification: 'dup', acknowledged: true });
      crmServiceStub.mergeParties.mockReturnValue(of({ survivorPartyId: 'party-a', losingPartyId: 'party-b' }));
      component.submitMerge();

      component.startNewMerge();

      expect(component.step()).toBe('search');
      expect(component.searchState()).toBe('idle');
      expect(component.selectedParties()).toEqual([]);
      expect(component.survivorPartyId()).toBeNull();
      expect(component.mergeResult()).toBeNull();
    });

    it('back() navigates to the CRM landing page', async () => {
      await setup();
      component.back();
      expect(routerStub.navigate).toHaveBeenCalledWith(['/app/crm']);
    });
  });
});
