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
      toggle.click();
      render();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
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

  describe('service search in the dialog', () => {
    const alignment: ClaimableService = { operationCode: ALIGN, name: 'Wheel alignment, 4-wheel', operationCategory: null };

    it('adds a service the shared search finds, and learns its name', async () => {
      await setUp();
      component.openCreate();
      render();
      expect(query('app-service-search #bay-service-search')).not.toBeNull();
      component.addService(alignment);
      expect(component.draft().serviceCapabilityCodes).toEqual([ALIGN]);
      expect(component.serviceLabel(ALIGN)).toBe('Wheel alignment, 4-wheel');
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

  describe('specialty services from the cards', () => {
    const brakes: ClaimableService = { operationCode: 'BRAKE-INSPECTION', name: 'Brake inspection', operationCategory: 'DIAGNOSTIC' };
    const rotation: ClaimableService = { operationCode: 'TIRE-ROTATION', name: 'Tire rotation', operationCategory: 'TIRE_SERVICE' };
    const cardOf = (bayId: string) =>
      component
        .lanes()
        .flatMap(lane => lane.cards)
        .find(card => card.bay.id === bayId)!;
    const outcomeText = (): string => query('.outcome')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    beforeEach(async () => setUp());

    it('saves a service dropped on a card, says what changed, moves the card, and can undo', () => {
      const general = RIVERSIDE[0];
      locationServiceStub.patchBay
        .mockReturnValueOnce(of({ ...general, serviceCapabilityCodes: ['BRAKE-INSPECTION'] }))
        .mockReturnValueOnce(of(general));

      component.onServiceDragStart(brakes);
      expect(component.dropState(cardOf('b10'))).toBe('READY');
      component.onCardDrop(cardOf('b10'), new DragEvent('drop'));
      render();

      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b10', { serviceCapabilityCodes: ['BRAKE-INSPECTION'] });
      expect(outcomeText()).toContain('Only Bay 10 can now be assigned Brake inspection here.');
      expect(outcomeText()).toContain('Bay 10 moved to Specialty.');
      expect(component.lanes()[1].cards.map(card => card.bay.name)).toContain('Bay 10');

      query<HTMLButtonElement>('.undo-btn')!.click();
      render();
      expect(locationServiceStub.patchBay).toHaveBeenLastCalledWith('loc-1', 'b10', { serviceCapabilityCodes: [] });
      expect(outcomeText()).toContain('Change to Bay 10 undone.');
      expect(query('.undo-btn')).toBeNull();
    });

    it('refuses a drop on a card that already has the service', () => {
      component.onServiceDragStart({ operationCode: ALIGN, name: 'Wheel alignment', operationCategory: null });
      render();
      expect(component.dropState(cardOf('b4'))).toBe('ALREADY');
      expect(cardText('b4')).toContain('Already on Bay 4');
      component.onCardDrop(cardOf('b4'), new DragEvent('drop'));
      expect(locationServiceStub.patchBay).not.toHaveBeenCalled();
    });

    it('shows the new chip as pending, and runs one save per card at a time', () => {
      const pending = new Subject<BayResponse>();
      locationServiceStub.patchBay.mockReturnValueOnce(pending);
      component.addServices(RIVERSIDE[0], [brakes]);
      render();
      expect(cardOf('b10').saving).toBe(true);
      expect(query('#bay-b10 .chip-pending')?.textContent).toContain('Brake inspection');

      component.addServices(RIVERSIDE[0], [rotation]);
      render();
      expect(locationServiceStub.patchBay).toHaveBeenCalledTimes(1);
      expect(query('#bay-b10 .card-error')?.textContent).toContain('Bay 10 is still saving.');

      pending.next({ ...RIVERSIDE[0], serviceCapabilityCodes: ['BRAKE-INSPECTION'] });
      expect(cardOf('b10').saving).toBe(false);
    });

    it('rolls a refused change back and says why in the card', () => {
      locationServiceStub.patchBay.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422 })));
      component.addServices(RIVERSIDE[0], [brakes]);
      render();
      expect(cardOf('b10').codes).toEqual([]);
      expect(query('#bay-b10 .card-error[role="alert"]')?.textContent).toContain(
        "Couldn't change Bay 10's services: one of them isn't an active catalog service.",
      );
      expect(query('.outcome')).toBeNull();
    });

    it('removes a chip with its × button and says the service became general work', () => {
      const tireBay = RIVERSIDE[2];
      const remaining = TIRE_CODES.filter(code => code !== TIRE_CODES[0]);
      locationServiceStub.patchBay.mockReturnValueOnce(of({ ...tireBay, serviceCapabilityCodes: remaining }));
      const remove = query<HTMLButtonElement>(`#chip-remove-b3-${TIRE_CODES[0]}`)!;
      expect(remove.getAttribute('aria-label')).toBe('Remove Tire install set 4 from Bay 3');
      remove.click();
      render();
      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b3', { serviceCapabilityCodes: remaining });
      expect(outcomeText()).toContain('Tire install set 4 is now general work');
    });

    it("asks before removing a bay's last service", () => {
      locationServiceStub.patchBay.mockReturnValueOnce(of({ ...RIVERSIDE[3], serviceCapabilityCodes: [] }));
      component.removeServiceFromBay(RIVERSIDE[3], ALIGN);
      render();
      expect(locationServiceStub.patchBay).not.toHaveBeenCalled();
      expect(query('#confirm-remove-body')?.textContent).toContain(
        'Bay 4 becomes a general bay and can be assigned any general service.',
      );
      query<HTMLButtonElement>('.confirm-remove-btn')!.click();
      render();
      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b4', { serviceCapabilityCodes: [] });
      expect(outcomeText()).toContain('Bay 4 moved to General.');
    });

    it('removes a chip dropped on the services list', () => {
      locationServiceStub.patchBay.mockReturnValueOnce(of(RIVERSIDE[2]));
      component.onChipDragStart(RIVERSIDE[2], TIRE_CODES[1], new DragEvent('dragstart'));
      expect(component.railRemoveTarget()?.key).toBe('LOCATION.BAYS.DROP.REMOVE_ZONE');
      component.onRailRemoveDrop();
      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b3', {
        serviceCapabilityCodes: TIRE_CODES.filter(code => code !== TIRE_CODES[1]),
      });
      expect(component.dragging()).toBeNull();
    });

    it('adds several services through the Add service dialog in one save', () => {
      locationServiceStub.patchBay.mockReturnValueOnce(
        of({ ...RIVERSIDE[0], serviceCapabilityCodes: ['BRAKE-INSPECTION', 'TIRE-ROTATION'] }),
      );
      query<HTMLButtonElement>('#add-service-b10')!.click();
      render();
      component.pick(brakes);
      component.pick(rotation);
      render();
      expect(text()).toContain('Bay 10 will be the only bay here for 2 of these.');
      const add = query<HTMLButtonElement>('.confirm-add-btn')!;
      expect(add.textContent?.trim()).toBe('Add 2 services');
      add.click();
      render();
      expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'b10', {
        serviceCapabilityCodes: ['BRAKE-INSPECTION', 'TIRE-ROTATION'],
      });
      expect(component.addDialogBay()).toBeNull();
      expect(outcomeText()).toContain('2 services added to Bay 10.');
    });

    it('lists who does what, and flags single and out-of-service claims', () => {
      expect(query('.who-summary')?.textContent?.replace(/\s+/g, ' ')).toContain(
        '11 specialty services claimed · 10 with only one bay · 1 with no bay in service',
      );
      query<HTMLButtonElement>('.who-heading .band-toggle')!.click();
      render();
      const dot = component.claimRows().find(row => row.code === 'DOT-ANNUAL-INSPECTION')!;
      expect(dot.flag).toBe('NONE_IN_SERVICE');
      expect(text()).toContain('Bay 5 (out of service)');

      component.showBay(dot.down[0]);
      render();
      expect(component.outOfServiceOpen()).toBe(true);
    });

    it('describes each listed service by who claims it here', () => {
      expect(component.describeService(ALIGN)).toEqual({ key: 'LOCATION.BAYS.RAIL.ONLY', params: { bay: 'Bay 4' } });
      expect(component.describeService('DOT-ANNUAL-INSPECTION').key).toBe('LOCATION.BAYS.RAIL.ON_HOLD');
      expect(component.describeService('BRAKE-INSPECTION').key).toBe('LOCATION.BAYS.RAIL.GENERAL_WORK');
    });
  });

  it('offers no card changes without location:bay:manage', async () => {
    session.permissions = [...LOCATION_PAGE.bays, ...LOCATION_PAGE.catalogServiceView];
    await setUp();
    expect(query('.chip-remove')).toBeNull();
    expect(query('.add-service-btn')).toBeNull();
    component.addServices(RIVERSIDE[0], [{ operationCode: 'X-1', name: 'X', operationCategory: null }]);
    component.onServiceDragStart({ operationCode: 'X-1', name: 'X', operationCategory: null });
    expect(component.dropState(component.lanes()[0].cards[0])).toBeNull();
    expect(locationServiceStub.patchBay).not.toHaveBeenCalled();
  });
});
