import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import type { BayRequest, BayResponse } from '@durion-sdk/location';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { LOCATION_LOOKUP_SOURCE } from '../../../../shared/location-picker/location-lookup-source.tokens';
import { BAY_TYPE_DEFAULT_CODES } from '../../models/bay-setup.models';
import { ClaimableService, LocationService } from '../../services/location.service';
import { BaysPageComponent } from './bays-page.component';

const ALIGN = 'WHEEL-ALIGNMENT-4-WHEEL';
const TIRE_CODES = BAY_TYPE_DEFAULT_CODES.TIRE_SERVICE;

const bay = (overrides: Partial<BayResponse> = {}): BayResponse => ({
  id: 'bay-1',
  locationId: 'loc-1',
  name: 'Bay 1',
  bayType: 'GENERAL_SERVICE',
  status: 'ACTIVE',
  maxConcurrentVehicles: 1,
  serviceCapabilityCodes: [],
  ...overrides,
});

const RIVERSIDE: BayResponse[] = [
  bay({ id: 'b10', name: 'Bay 10' }),
  bay({ id: 'b2', name: 'Bay 2', maxDutyClass: 6 }),
  bay({ id: 'b3', name: 'Bay 3', bayType: 'TIRE_SERVICE', serviceCapabilityCodes: [...TIRE_CODES] }),
  bay({ id: 'b4', name: 'Bay 4', bayType: 'ALIGNMENT', serviceCapabilityCodes: [ALIGN] }),
  bay({ id: 'wash', name: 'Wash bay', bayType: 'WASH_DETAIL' }),
  bay({ id: 'down', name: 'Bay 5', status: 'OUT_OF_SERVICE', serviceCapabilityCodes: ['DOT-ANNUAL-INSPECTION'] }),
  bay({ id: 'itest', name: 'Itest bay itest-1790388132-rwlg' }),
];

/** `null` models a token with no permission claim: permissions unknown, controls stay enabled. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};

const locationServiceStub = {
  listBays: vi.fn<(locationId: string) => Observable<BayResponse[]>>(),
  createBay: vi.fn<(locationId: string, request: BayRequest) => Observable<BayResponse>>(),
  patchBay: vi.fn<(locationId: string, bayId: string, patch: BayRequest) => Observable<BayResponse>>(),
  searchClaimableServices: vi.fn<(query: string) => Observable<{ services: ClaimableService[]; ok: boolean }>>(),
};

const locationLookupSourceStub = {
  getAll: vi.fn().mockReturnValue(
    of([
      { id: 'loc-1', name: 'Riverside Auto Service' },
      { id: 'loc-2', name: 'North Austin' },
    ]),
  ),
  getById: vi.fn().mockReturnValue(of(null)),
};

describe('BaysPageComponent', () => {
  let fixture: ComponentFixture<BaysPageComponent>;
  let component: BaysPageComponent;
  let queryParams: BehaviorSubject<Record<string, string>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const query = <T extends Element = HTMLElement>(selector: string): T | null =>
    (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  const queryAll = (selector: string): HTMLElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector));
  const render = (): void => fixture.detectChanges();
  const cardText = (bayId: string): string => query(`#bay-${bayId}`)?.textContent ?? '';

  async function setUp(params: Record<string, string> = { locationId: 'loc-1' }): Promise<void> {
    queryParams = new BehaviorSubject(params);
    await TestBed.configureTestingModule({
      imports: [BaysPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams } },
        { provide: AuthService, useValue: authStub },
        { provide: LocationService, useValue: locationServiceStub },
        { provide: LOCATION_LOOKUP_SOURCE, useValue: locationLookupSourceStub },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(BaysPageComponent);
    component = fixture.componentInstance;
    render();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    session.permissions = null;
    locationServiceStub.listBays.mockReturnValue(of(RIVERSIDE));
    locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [], ok: true }));
  });

  describe('loading', () => {
    it('asks for a location and reads nothing until one is chosen', async () => {
      await setUp({});
      expect(locationServiceStub.listBays).not.toHaveBeenCalled();
      expect(component.state()).toBe('idle');
      expect(text()).toContain('Choose a location to set up its bays.');
    });

    it('reads the bays of the location in the URL', async () => {
      await setUp();
      expect(locationServiceStub.listBays).toHaveBeenCalledWith('loc-1');
      expect(component.state()).toBe('ready');
    });

    it('writes a picked location to the URL and reads its bays', async () => {
      await setUp({});
      component.onLocationSelected('loc-1');
      render();
      expect(navigate).toHaveBeenCalledWith([], { queryParams: { locationId: 'loc-1' }, queryParamsHandling: 'merge' });
      expect(locationServiceStub.listBays).toHaveBeenCalledWith('loc-1');
    });

    it('drops a slow read for a location the user has since left', async () => {
      const first = new Subject<BayResponse[]>();
      locationServiceStub.listBays.mockReturnValueOnce(first).mockReturnValueOnce(of([bay({ name: 'North bay' })]));
      await setUp();
      expect(component.state()).toBe('loading');

      component.onLocationSelected('loc-2');
      render();
      first.next(RIVERSIDE);
      render();

      expect(locationServiceStub.listBays.mock.calls).toEqual([['loc-1'], ['loc-2']]);
      expect(component.bays().map(b => b.name)).toEqual(['North bay']);
    });

    it('shows a load failure with a retry that reads again', async () => {
      locationServiceStub.listBays.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
      await setUp();
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('LOCATION.BAYS.ERROR.LOAD');
      expect(query('[role="alert"]')?.textContent).toContain("Couldn't load the bays for this location.");

      query<HTMLButtonElement>('.retry-btn')!.click();
      render();

      expect(locationServiceStub.listBays).toHaveBeenCalledTimes(2);
      expect(component.state()).toBe('ready');
    });
  });

  describe('lanes and cards', () => {
    beforeEach(async () => setUp());

    it('groups bays into lanes in natural name order, hiding test records and the out-of-service cards', () => {
      const lanes = component.lanes().map(lane => [lane.lane, lane.cards.map(card => card.bay.name)]);
      expect(lanes).toEqual([
        ['GENERAL', ['Bay 2', 'Bay 10']],
        ['SPECIALTY', ['Bay 3', 'Bay 4']],
        ['WASH', ['Wash bay']],
        ['OUT_OF_SERVICE', ['Bay 5']],
      ]);
      expect(queryAll('h2.lane-heading').map(h => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'General 2',
        'Specialty 2',
        'Wash & detail 1',
        '▸ Out of service 1',
      ]);
      expect(query('#bay-down')).toBeNull();
      expect(text()).toContain('(1 hidden)');
    });

    it('opens the out-of-service lane on request', () => {
      const toggle = query<HTMLButtonElement>('.lane-toggle')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.hasAttribute('aria-controls')).toBe(false);
      toggle.click();
      render();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(query(`#${toggle.getAttribute('aria-controls')}`)).not.toBeNull();
      expect(cardText('down')).toContain('Its specialty services are open to other bays');
      expect(cardText('down')).toContain('Out of service');
    });

    it('shows test records, tagged, when the URL toggle is on', () => {
      component.toggleTests(true);
      render();
      expect(navigate).toHaveBeenCalledWith([], { queryParams: { tests: 1 }, queryParamsHandling: 'merge' });
      expect(cardText('itest')).toContain('Test record');
    });

    it('says what each bay can be assigned, in words', () => {
      expect(cardText('b10')).toContain('Can be assigned any general service, offered before specialty bays.');
      expect(cardText('b10')).toContain('Takes any vehicle.');
      expect(cardText('b2')).toContain('Takes vehicles up to class 6 (medium).');
      expect(cardText('b4')).toContain(
        'Can be assigned 1 specialty service, plus general services after the general bays.',
      );
      expect(cardText('wash')).toContain("Can't be assigned anything yet.");
      expect(cardText('b10')).toContain('General bay: no specialty services.');
    });

    it('marks the only in-service bay for a service, and shows four chips before "+N more"', () => {
      const chips = queryAll('#bay-b4 .chip');
      expect(chips).toHaveLength(1);
      expect(chips[0].querySelector('span')?.textContent).toBe('Wheel alignment 4 wheel');
      expect(chips[0].querySelector('.chip-marker')?.textContent).toBe('Only bay');
      expect(queryAll('#bay-b3 .chip')).toHaveLength(4);
      const more = query<HTMLButtonElement>('#bay-b3 .more-chips-btn')!;
      expect(more.textContent?.trim()).toBe('+5 more');
      more.click();
      render();
      expect(queryAll('#bay-b3 .chip')).toHaveLength(9);
      expect(query('#bay-b3 .more-chips-btn')?.textContent?.trim()).toBe('Show fewer');
    });
  });

  describe('permissions', () => {
    it('offers New bay and Edit to a holder of location:bay:manage', async () => {
      session.permissions = [...LOCATION_PAGE.bays, ...LOCATION_PAGE.bayManage];
      await setUp();
      expect(component.canEdit()).toBe(true);
      expect(query('.new-bay-btn')).not.toBeNull();
      expect(query('#bay-b10 .edit-bay-btn')?.getAttribute('aria-label')).toBe('Edit Bay 10');
    });

    it('is view only without location:bay:manage, in the controls and the handlers', async () => {
      session.permissions = [...LOCATION_PAGE.bays];
      await setUp();
      expect(component.canEdit()).toBe(false);
      expect(query('.new-bay-btn')).toBeNull();
      expect(query('.edit-bay-btn')).toBeNull();
      expect(text()).toContain("View only: you can't change bays at this location.");

      component.openCreate();
      component.openEdit(RIVERSIDE[0]);
      expect(component.dialogMode()).toBeNull();
    });
  });

  describe('create', () => {
    beforeEach(async () => setUp());

    it('creates a bay with every field the API needs, sending the specialty list the user sees', () => {
      const saved = bay({ id: 'b6', name: 'Bay 6', bayType: 'ALIGNMENT', serviceCapabilityCodes: [ALIGN] });
      locationServiceStub.createBay.mockReturnValueOnce(of(saved));

      component.openCreate();
      component.setName('  Bay 6 ');
      component.setType('ALIGNMENT');
      component.setVehicles('2');
      component.setDutyClass('6');
      render();
      expect(text()).toContain('Filled in from Alignment.');
      component.submit();
      render();

      expect(locationServiceStub.createBay).toHaveBeenCalledWith('loc-1', {
        name: 'Bay 6',
        bayType: 'ALIGNMENT',
        status: 'ACTIVE',
        capacity: { maxConcurrentVehicles: 2 },
        serviceCapabilityCodes: [ALIGN],
        maxDutyClass: 6,
      });
      expect(component.dialogMode()).toBeNull();
      expect(component.bays()).toContainEqual(saved);
      expect(query('.sr-only[aria-live="polite"]')?.textContent?.trim()).toBe('Bay 6 added to Specialty.');
    });

    it('leaves the duty class out for "No limit" and sends an explicit empty list for a general bay', () => {
      locationServiceStub.createBay.mockReturnValueOnce(of(bay({ id: 'b7', name: 'Bay 7' })));
      component.openCreate();
      component.setName('Bay 7');
      component.setType('TIRE_SERVICE');
      component.setGeneralBay(true);
      component.submit();

      expect(locationServiceStub.createBay).toHaveBeenCalledWith('loc-1', {
        name: 'Bay 7',
        bayType: 'TIRE_SERVICE',
        status: 'ACTIVE',
        capacity: { maxConcurrentVehicles: 1 },
        serviceCapabilityCodes: [],
      });
    });

    it('asks for a name before sending anything', () => {
      component.openCreate();
      component.submit();
      render();
      expect(locationServiceStub.createBay).not.toHaveBeenCalled();
      expect(query('#bay-name-error')?.textContent).toContain('Enter a name for the bay.');
      expect(query('#bay-name')?.getAttribute('aria-describedby')).toBe('bay-name-error bay-name-hint');
    });

    it('refuses a vehicle count below 1 before sending anything', () => {
      component.openCreate();
      component.setName('Bay 8');
      component.setVehicles('0');
      component.submit();
      expect(locationServiceStub.createBay).not.toHaveBeenCalled();
      expect(component.saveErrorKey()).toBe('LOCATION.BAYS.ERROR.VEHICLES');
    });

    it('refuses a fractional vehicle count rather than rounding it, and keeps it on screen', () => {
      component.openCreate();
      component.setName('Bay 8');
      component.setVehicles('1.5');
      render();
      component.submit();
      expect(locationServiceStub.createBay).not.toHaveBeenCalled();
      expect(component.saveErrorKey()).toBe('LOCATION.BAYS.ERROR.VEHICLES');
      expect(query<HTMLInputElement>('#bay-vehicles')?.value).toBe('1.5');
    });

    it('names the consequences of a new bay on its create button', () => {
      component.openCreate();
      component.setName('Bay 12');
      component.setType('WASH_DETAIL');
      render();
      const count = component.changeMessages().length;
      expect(count).toBeGreaterThan(0);
      expect(query('.submit-btn')?.textContent?.trim()).toBe(
        count === 1 ? 'Create bay and apply 1 change' : `Create bay and apply ${count} changes`,
      );
    });

    it('puts a duplicate name error under Name and keeps the dialog open', () => {
      locationServiceStub.createBay.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.openCreate();
      component.setName('Bay 2');
      component.submit();
      render();
      expect(component.dialogMode()).toBe('create');
      expect(query('#bay-name-error')?.textContent).toContain('Another bay here is already called Bay 2.');
    });

    for (const [status, key] of [
      [422, 'LOCATION.BAYS.ERROR.INVALID_SERVICES'],
      [400, 'LOCATION.BAYS.ERROR.INVALID'],
      [500, 'LOCATION.BAYS.ERROR.SAVE_FAILED'],
    ] as const) {
      it(`shows a ${status} refusal in the dialog`, () => {
      locationServiceStub.createBay.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
      component.openCreate();
      component.setName('Bay 9');
      component.submit();
      render();
      expect(component.saveErrorKey()).toBe(key);
      expect(query('.dialog-error[role="alert"]')).not.toBeNull();
      expect(component.saving()).toBe(false);
      });
    }

    it('switches the page to view only on a 403', () => {
      locationServiceStub.createBay.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.openCreate();
      component.setName('Bay 9');
      component.submit();
      expect(component.saveErrorKey()).toBe('LOCATION.BAYS.ERROR.NOT_ALLOWED');
      expect(component.canEdit()).toBe(false);
      render();
      expect(query<HTMLFieldSetElement>('fieldset.dialog-body')?.disabled).toBe(true);
      expect(query<HTMLButtonElement>('.submit-btn')?.disabled).toBe(true);
      expect(query('.dialog-error[role="alert"]')?.textContent).toBeTruthy();
      expect(query<HTMLButtonElement>('.cancel-btn')?.disabled).toBe(false);
    });

    it('closes the dialog and drops its save when the URL moves to another location', () => {
      const pending = new Subject<BayResponse>();
      locationServiceStub.patchBay.mockReturnValueOnce(pending);
      component.openEdit(RIVERSIDE[0]);
      component.setName('Bay 10 renamed');
      component.submit();
      expect(component.saving()).toBe(true);

      queryParams.next({ locationId: 'loc-2' });
      render();
      expect(component.dialogMode()).toBeNull();
      expect(component.saving()).toBe(false);
      expect(pending.observed).toBe(false);
    });

    it('closes an open dialog when another location is picked', () => {
      component.openEdit(RIVERSIDE[0]);
      component.onLocationSelected('loc-2');
      render();
      expect(component.dialogMode()).toBeNull();
      expect(component.editingBay()).toBeNull();
    });

    it('holds the dialog open, with Cancel and Save disabled, while the save is in flight', () => {
      const pending = new Subject<BayResponse>();
      locationServiceStub.createBay.mockReturnValueOnce(pending);
      component.openCreate();
      component.setName('Bay 11');
      component.submit();
      render();
      expect(query<HTMLButtonElement>('.submit-btn')?.disabled).toBe(true);
      component.closeDialog();
      expect(component.dialogMode()).toBe('create');

      pending.next(bay({ id: 'b11', name: 'Bay 11' }));
      expect(component.dialogMode()).toBeNull();
    });
  });

  describe('edit', () => {
    beforeEach(async () => setUp());

    it('asks what to do with the services on a retype, and sends the kept list', () => {
      const tireBay = RIVERSIDE[2];
      locationServiceStub.patchBay.mockReturnValueOnce(of({ ...tireBay, bayType: 'ALIGNMENT' }));
      component.openEdit(tireBay);
      component.setType('ALIGNMENT');
      render();
      expect(component.draft().serviceCapabilityCodes).toEqual([ALIGN]);
      expect(text()).toContain("Use Alignment's usual services (1)");
      expect(text()).toContain("Keep this bay's current services (9)");

      component.setTypeChoice('KEEP');
      component.submit();

      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b3', {
        name: 'Bay 3',
        bayType: 'ALIGNMENT',
        status: 'ACTIVE',
        capacity: { maxConcurrentVehicles: 1 },
        serviceCapabilityCodes: [...TIRE_CODES],
      });
    });

    it('previews the consequences and names their count on the save button', () => {
      component.openEdit(RIVERSIDE[3]);
      component.setStatus('OUT_OF_SERVICE');
      render();
      expect(queryAll('.change-list li').map(li => li.textContent?.trim())).toEqual([
        'Bay 4 stops being assigned new workorders.',
        'Wheel alignment 4 wheel becomes general work: any bay here except wash & detail can be assigned it.',
      ]);
      expect(query('.submit-btn')?.textContent?.trim()).toBe('Save and apply 2 changes');
    });

    it('says when nothing changes for the other bays', () => {
      component.openEdit(RIVERSIDE[0]);
      render();
      expect(text()).toContain('No change to what other bays can be assigned.');
      expect(query('.submit-btn')?.textContent?.trim()).toBe('Save');
    });

    it('locks "No limit" on a bay that already has a duty class, and explains why', () => {
      component.openEdit(RIVERSIDE[1]);
      render();
      expect(component.noLimitLocked()).toBe(true);
      expect(query<HTMLOptionElement>('#bay-duty option[value=""]')?.disabled).toBe(true);
      expect(query('#bay-duty')?.getAttribute('aria-describedby')).toBe('bay-duty-hint bay-duty-locked');
    });

    it('leaves an unchanged specialty list out of the patch', () => {
      const tireBay = RIVERSIDE[2];
      locationServiceStub.patchBay.mockReturnValueOnce(of({ ...tireBay, name: 'Tire bay' }));
      component.openEdit(tireBay);
      component.setName('Tire bay');
      component.submit();

      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b3', {
        name: 'Tire bay',
        bayType: 'TIRE_SERVICE',
        status: 'ACTIVE',
        capacity: { maxConcurrentVehicles: 1 },
      });
    });

    it('replaces the saved bay in place', () => {
      const renamed = { ...RIVERSIDE[0], name: 'Bay 1A' };
      locationServiceStub.patchBay.mockReturnValueOnce(of(renamed));
      component.openEdit(RIVERSIDE[0]);
      component.setName('Bay 1A');
      component.submit();
      expect(component.bays().find(b => b.id === 'b10')?.name).toBe('Bay 1A');
      expect(component.bays()).toHaveLength(RIVERSIDE.length);
    });
  });

  describe('service search', () => {
    const alignment: ClaimableService = { operationCode: ALIGN, name: 'Wheel alignment, 4-wheel', operationCategory: null };

    it('searches the catalog after two letters and adds a service by name', async () => {
      await setUp();
      locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [alignment], ok: true }));
      component.openCreate();
      component.onServiceQuery('a');
      expect(component.searchState()).toBe('idle');

      component.onServiceQuery('align');
      await new Promise(resolve => setTimeout(resolve, 300));
      render();

      expect(locationServiceStub.searchClaimableServices).toHaveBeenCalledWith('align');
      const add = query<HTMLButtonElement>('.add-service-btn')!;
      expect(add.getAttribute('aria-label')).toBe('Add Wheel alignment, 4-wheel');
      add.click();
      render();
      expect(component.draft().serviceCapabilityCodes).toEqual([ALIGN]);
      expect(text()).toContain('Already on this bay');
      // The name learned from the search replaces the derived label on the chip.
      expect(component.serviceLabel(ALIGN)).toBe('Wheel alignment, 4-wheel');
    });

    it('reports a failed search rather than "no matches"', async () => {
      await setUp();
      locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [], ok: false }));
      component.openCreate();
      component.onServiceQuery('align');
      await new Promise(resolve => setTimeout(resolve, 300));
      render();
      expect(component.searchState()).toBe('failed');
      expect(text()).toContain("Couldn't search the service catalog.");
    });

    it('explains the missing search to a user who cannot view the catalog', async () => {
      session.permissions = [...LOCATION_PAGE.bays, ...LOCATION_PAGE.bayManage];
      await setUp();
      component.openCreate();
      render();
      expect(query('#bay-service-search')).toBeNull();
      expect(text()).toContain("You can't view the service catalog");
    });
  });
});
