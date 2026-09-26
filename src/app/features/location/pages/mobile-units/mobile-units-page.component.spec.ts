import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import type {
  CoverageRuleRequest,
  CoverageRuleResponse,
  EligibleMobileUnitResponse,
  MobileUnitRequest,
  MobileUnitResponse,
  ServiceAreaResponse,
  TravelBufferPolicyResponse,
} from '@durion-sdk/location';
import { CoverageRuleResponseRuleTypeEnum, MobileUnitResponseStatusEnum } from '@durion-sdk/location';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { isoDateLocal } from '../../../../core/utils/local-date';
import { LOCATION_LOOKUP_SOURCE } from '../../../../shared/location-picker/location-lookup-source.tokens';
import type { MobileUnitPatch } from '../../models/mobile-unit-setup.models';
import { ClaimableService, LocationService, MobileUnitsRead } from '../../services/location.service';
import { MobileUnitsPageComponent } from './mobile-units-page.component';

const TODAY = isoDateLocal(new Date());
const inDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDateLocal(date);
};
const TPMS = 'TPMS-SENSOR-SERVICE';

const unit = (overrides: Partial<MobileUnitResponse> = {}): MobileUnitResponse => ({
  id: 'mu-1',
  name: 'Van 1',
  baseLocationId: 'loc-1',
  status: MobileUnitResponseStatusEnum.Inactive,
  travelBufferPolicyId: 'p-std',
  serviceCapabilityCodes: [TPMS],
  ...overrides,
});
const rule = (overrides: Partial<CoverageRuleResponse> = {}): CoverageRuleResponse => ({
  id: 'rule-1',
  mobileUnitId: 'mu-1',
  serviceAreaId: 'area-n',
  ruleType: CoverageRuleResponseRuleTypeEnum.ServiceArea,
  priority: 1,
  ...overrides,
});

const AREAS: ServiceAreaResponse[] = [
  {
    id: 'area-n',
    name: 'Riverside north',
    active: true,
    postalCodes: ['78701', '78702', '78703'].map(postalCode => ({ postalCode, countryCode: 'US' })),
  },
  { id: 'area-e', name: 'Eastside', active: false, postalCodes: [{ postalCode: '78721', countryCode: 'US' }] },
];
const POLICIES: TravelBufferPolicyResponse[] = [
  { id: 'p-std', name: 'Standard', bufferType: 'FLAT_MINUTES', bufferValue: 15 },
  { id: 'p-bad', name: 'Seeded', bufferType: 'MINUTES', bufferValue: 10 },
];

const VAN_9 = unit({ id: 'mu-9', name: 'Van 9', status: MobileUnitResponseStatusEnum.Active });
const VAN_3 = unit({ id: 'mu-3', name: 'Van 3', status: MobileUnitResponseStatusEnum.Active });
const VAN_7 = unit({ id: 'mu-7', name: 'Van 7' });
const VAN_11 = unit({ id: 'mu-11', name: 'Van 11' });
const ITEST = unit({ id: 'mu-t', name: 'Itest unit itest-1790388132', travelBufferPolicyId: undefined, serviceCapabilityCodes: [] });
const UNITS = [VAN_9, VAN_3, VAN_7, VAN_11, ITEST];
const COVERAGE = new Map<string, CoverageRuleResponse[]>([
  ['mu-9', [rule({ mobileUnitId: 'mu-9' })]],
  ['mu-3', [rule({ id: 'rule-3', mobileUnitId: 'mu-3', validFrom: inDays(10) })]],
  ['mu-7', []],
  ['mu-11', [rule({ id: 'rule-11', mobileUnitId: 'mu-11', serviceAreaId: 'area-e' })]],
  ['mu-t', []],
]);

const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};

const locationServiceStub = {
  listMobileUnits: vi.fn<(locationId: string) => Observable<MobileUnitsRead>>(),
  listServiceAreas: vi.fn<() => Observable<{ areas: ServiceAreaResponse[]; ok: boolean }>>(),
  listTravelBufferPolicies: vi.fn<() => Observable<{ policies: TravelBufferPolicyResponse[]; ok: boolean }>>(),
  createMobileUnit: vi.fn<(request: MobileUnitRequest) => Observable<MobileUnitResponse>>(),
  patchMobileUnit: vi.fn<(id: string, patch: MobileUnitPatch) => Observable<MobileUnitResponse>>(),
  replaceCoverageRules: vi.fn<(id: string, rules: CoverageRuleRequest[]) => Observable<CoverageRuleResponse[]>>(),
  findEligibleMobileUnits: vi.fn<(postalCode: string, country: string, at: string) => Observable<EligibleMobileUnitResponse[]>>(),
  searchClaimableServices: vi.fn<(query: string) => Observable<{ services: ClaimableService[]; ok: boolean }>>(),
};

const locationLookupSourceStub = {
  getAll: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Riverside Auto Service' }])),
  getById: vi.fn().mockReturnValue(of(null)),
};

describe('MobileUnitsPageComponent', () => {
  let fixture: ComponentFixture<MobileUnitsPageComponent>;
  let component: MobileUnitsPageComponent;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  const query = <T extends Element = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const cardText = (unitId: string): string => query(`#unit-${unitId}`)?.textContent?.replace(/\s+/g, ' ') ?? '';
  const render = (): void => fixture.detectChanges();
  const card = (unitId: string) =>
    component
      .groups()
      .flatMap(group => group.cards)
      .find(view => view.unit.id === unitId)!;

  async function setUp(params: Record<string, string> = { locationId: 'loc-1' }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MobileUnitsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject(params) } },
        { provide: AuthService, useValue: authStub },
        { provide: LocationService, useValue: locationServiceStub },
        { provide: LOCATION_LOOKUP_SOURCE, useValue: locationLookupSourceStub },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(MobileUnitsPageComponent);
    component = fixture.componentInstance;
    render();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    session.permissions = null;
    locationServiceStub.listMobileUnits.mockReturnValue(of({ units: UNITS, coverage: COVERAGE, coverageOk: true }));
    locationServiceStub.listServiceAreas.mockReturnValue(of({ areas: AREAS, ok: true }));
    locationServiceStub.listTravelBufferPolicies.mockReturnValue(of({ policies: POLICIES, ok: true }));
    locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [], ok: true }));
  });

  describe('loading', () => {
    it('asks for a base location and reads no units until one is chosen', async () => {
      await setUp({});
      expect(locationServiceStub.listMobileUnits).not.toHaveBeenCalled();
      expect(text()).toContain('Choose the shop these units are based at.');
    });

    it("reads the location's units with their coverage", async () => {
      await setUp();
      expect(locationServiceStub.listMobileUnits).toHaveBeenCalledWith('loc-1');
      expect(component.state()).toBe('ready');
      expect(component.coverageRead()).toBe('OK');
    });

    it('shows a load failure with a retry', async () => {
      locationServiceStub.listMobileUnits.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
      await setUp();
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('LOCATION.MOBILE_UNITS.ERROR.LOAD');
      query<HTMLButtonElement>('.retry-btn')!.click();
      render();
      expect(component.state()).toBe('ready');
    });

    it('says when coverage could not be read, instead of showing "no coverage"', async () => {
      locationServiceStub.listMobileUnits.mockReturnValue(of({ units: UNITS, coverage: new Map(), coverageOk: false }));
      await setUp();
      expect(text()).toContain("Some units' coverage couldn't be loaded.");
      expect(cardText('mu-9')).toContain("Active. Its coverage couldn't be loaded.");
      expect(cardText('mu-7')).not.toContain('Ready to activate');
      expect(query<HTMLButtonElement>('#edit-coverage-mu-9')?.disabled).toBe(true);
    });
  });

  describe('groups and cards', () => {
    beforeEach(async () => setUp());

    it('groups units into Active and Set up, not active, in natural order, hiding test records', () => {
      expect(component.groups().map(group => [group.group, group.cards.map(view => view.name)])).toEqual([
        ['ACTIVE', ['Van 3', 'Van 9']],
        ['INACTIVE', ['Van 7', 'Van 11']],
      ]);
      expect(text()).toContain('(1 hidden)');
    });

    it('says where an active unit can be sent, with its coverage, capabilities and travel buffer', () => {
      const van9 = cardText('mu-9');
      expect(van9).toContain('Can be sent to customers in 1 service area today.');
      expect(van9).toContain('Riverside north · 3 postal codes');
      expect(van9).toContain('Tpms sensor service');
      expect(van9).toContain('Recorded, not used for assignment yet.');
      expect(van9).toContain('Standard (15 minutes flat)');
      expect(van9).not.toContain('Ready to activate');
    });

    it('warns about an active unit with no rule in effect today', () => {
      expect(card('mu-3').sentWarning).toBe(true);
      expect(cardText('mu-3')).toContain('no coverage rule is in effect today');
      expect(cardText('mu-3')).toContain('From');
    });

    it('warns that a switched-off area still counts', () => {
      expect(cardText('mu-11')).toContain('Eastside is switched off, but units covering it are still matched.');
    });

    it('shows the activation checklist with a fix for what is missing', () => {
      const van7 = cardText('mu-7');
      expect(van7).toContain('Travel buffer policy: done');
      expect(van7).toContain('At least one coverage rule: missing');
      expect(query('#unit-mu-7 .activate-btn')?.getAttribute('aria-disabled')).toBe('true');
      expect(query('#unit-mu-7 .activate-btn')?.getAttribute('aria-label')).toBe('Activate Van 7');
    });
  });

  describe('activation', () => {
    beforeEach(async () => setUp());

    it("doesn't send an incomplete unit, and says what it needs", () => {
      component.activate(card('mu-7'));
      render();
      expect(locationServiceStub.patchMobileUnit).not.toHaveBeenCalled();
      expect(query('.sr-only[aria-live="polite"]')?.textContent?.trim()).toBe(
        'Van 7 needs a coverage rule before it can be activated.',
      );
    });

    it('activates a complete unit and moves it to Active', () => {
      locationServiceStub.patchMobileUnit.mockReturnValueOnce(of({ ...VAN_11, status: MobileUnitResponseStatusEnum.Active }));
      component.activate(card('mu-11'));
      render();
      expect(locationServiceStub.patchMobileUnit).toHaveBeenCalledWith('mu-11', { status: 'ACTIVE' });
      expect(component.groups()[0].cards.map(view => view.name)).toContain('Van 11');
      expect(query('.sr-only[aria-live="polite"]')?.textContent?.trim()).toBe(
        'Van 11 is active and can be sent to customers in 1 service area.',
      );
    });

    it('shows a refusal in the card', () => {
      locationServiceStub.patchMobileUnit.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422 })));
      component.activate(card('mu-11'));
      render();
      expect(query('#unit-mu-11 .card-error[role="alert"]')?.textContent).toContain("Van 11 couldn't be activated");
    });
  });

  describe('permissions', () => {
    it('is view only without location:mobile-unit:manage, in the controls and the handlers', async () => {
      session.permissions = [...LOCATION_PAGE.mobileUnits];
      await setUp();
      expect(query('.new-unit-btn')).toBeNull();
      expect(query('.edit-unit-btn')).toBeNull();
      expect(query('.activate-btn')).toBeNull();
      expect(text()).toContain("View only: you can't change mobile units at this location.");
      component.openCreate();
      component.openCoverage(VAN_7);
      component.activate(card('mu-11'));
      expect(component.dialogMode()).toBeNull();
      expect(component.coverageUnit()).toBeNull();
      expect(locationServiceStub.patchMobileUnit).not.toHaveBeenCalled();
    });

    it('offers the controls to a holder of location:mobile-unit:manage', async () => {
      session.permissions = [...LOCATION_PAGE.mobileUnits, ...LOCATION_PAGE.mobileUnitManage];
      await setUp();
      expect(query('.new-unit-btn')).not.toBeNull();
      expect(query('#edit-coverage-mu-9')?.getAttribute('aria-label')).toBe('Edit coverage for Van 9');
    });
  });

  describe('create and edit', () => {
    beforeEach(async () => setUp());

    it('creates an inactive unit at the base location, then offers to add coverage', () => {
      const saved = unit({ id: 'mu-12', name: 'Van 12' });
      locationServiceStub.createMobileUnit.mockReturnValueOnce(of(saved));
      component.openCreate();
      component.setName(' Van 12 ');
      component.setPolicy('p-std');
      component.addCapability({ operationCode: TPMS, name: 'TPMS sensor service', operationCategory: null });
      component.setNotes('Parks at the north lot');
      component.submit();
      render();

      expect(locationServiceStub.createMobileUnit).toHaveBeenCalledWith({
        name: 'Van 12',
        notes: 'Parks at the north lot',
        serviceCapabilityCodes: [TPMS],
        travelBufferPolicyId: 'p-std',
        baseLocationId: 'loc-1',
        status: 'INACTIVE',
      });
      expect(text()).toContain('Add coverage for Van 12 now?');
      component.addCoverageForCreated();
      render();
      expect(component.coverageUnit()?.id).toBe('mu-12');
      expect(component.dialogMode()).toBeNull();
    });

    it('puts a duplicate name error under Name', () => {
      locationServiceStub.createMobileUnit.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.openCreate();
      component.setName('Van 9');
      component.submit();
      render();
      expect(query('#unit-name-error')?.textContent).toContain('Another unit based here is already called Van 9.');
    });

    it('patches only what changed', () => {
      locationServiceStub.patchMobileUnit.mockReturnValueOnce(of({ ...VAN_9, name: 'Van 9A' }));
      component.openEdit(VAN_9);
      component.setName('Van 9A');
      component.submit();
      expect(locationServiceStub.patchMobileUnit).toHaveBeenCalledWith('mu-9', { name: 'Van 9A' });
    });

    it("won't set an incomplete unit active, and keeps an active unit's last capability", () => {
      component.openEdit(VAN_7);
      component.setStatus('ACTIVE');
      expect(component.draft().status).toBe('INACTIVE');
      component.closeDialog();

      component.openEdit(VAN_9);
      render();
      expect(component.lastCapabilityLocked()).toBe(true);
      expect(query('.chip-remove')?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('coverage editor', () => {
    beforeEach(async () => setUp());

    it('checks the rows before saving, then replaces the rule set', () => {
      locationServiceStub.replaceCoverageRules.mockImplementationOnce((_id, rules) =>
        of(rules.map((r, i) => rule({ ...r, ruleType: CoverageRuleResponseRuleTypeEnum.ServiceArea, id: `new-${i}`, mobileUnitId: 'mu-7' }))),
      );
      component.openCoverage(VAN_7);
      component.addRule();
      component.saveCoverage();
      render();
      expect(locationServiceStub.replaceCoverageRules).not.toHaveBeenCalled();
      expect(text()).toContain('Choose a service area.');

      const key = component.ruleRows()[0].key;
      component.setRuleField(key, 'serviceAreaId', 'area-n');
      component.saveCoverage();
      render();

      expect(locationServiceStub.replaceCoverageRules).toHaveBeenCalledWith('mu-7', [
        { serviceAreaId: 'area-n', ruleType: 'SERVICE_AREA', priority: 1 },
      ]);
      expect(component.coverageUnit()).toBeNull();
      expect(card('mu-7').checklist?.coverage).toBe(true);
      expect(card('mu-7').ready).toBe(true);
    });

    it("won't leave an active unit with no rules", () => {
      component.openCoverage(VAN_9);
      component.removeRule(component.ruleRows()[0].key);
      render();
      expect(query('#coverage-form-error')?.textContent).toContain('An active unit needs at least one coverage rule.');
      expect(query('.save-coverage-btn')?.getAttribute('aria-disabled')).toBe('true');
      component.saveCoverage();
      expect(locationServiceStub.replaceCoverageRules).not.toHaveBeenCalled();
    });

    it('describes the chosen area under its select', () => {
      component.openCoverage(VAN_11);
      render();
      expect(text()).toContain('1 postal code. Switched off, but still counts.');
    });
  });

  describe('check coverage', () => {
    beforeEach(async () => setUp());

    it('needs a postal code before checking', () => {
      component.runCheck();
      expect(locationServiceStub.findEligibleMobileUnits).not.toHaveBeenCalled();
      expect(component.checkErrorKey()).toBe('LOCATION.MOBILE_UNITS.CHECK.POSTAL_REQUIRED');
    });

    it("lists this shop's covering units in order, for the chosen day", () => {
      locationServiceStub.findEligibleMobileUnits.mockReturnValueOnce(
        of([
          { id: 'mu-9', name: 'Van 9', baseLocationId: 'loc-1', priority: 1 },
          { id: 'mu-x', name: 'Elsewhere van', baseLocationId: 'loc-2', priority: 2 },
        ]),
      );
      component.toggleCheck();
      component.checkPostalCode.set('78701');
      component.runCheck();
      render();

      expect(locationServiceStub.findEligibleMobileUnits).toHaveBeenCalledWith('78701', 'US', `${TODAY}T12:00:00Z`);
      expect(Array.from(el().querySelectorAll('.check-list li')).map(li => li.textContent?.trim())).toEqual([
        'Van 9, priority 1',
      ]);
    });
  });
});
