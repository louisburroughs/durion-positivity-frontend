import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import type { PostalCodeEntry, ServiceAreaRequest, ServiceAreaResponse } from '@durion-sdk/location';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import type { ServiceAreaPatch } from '../../models/setup-lists.models';
import { LocationService } from '../../services/location.service';
import { ServiceAreasPageComponent } from './service-areas-page.component';

const codes = (...values: string[]): PostalCodeEntry[] => values.map(postalCode => ({ postalCode, countryCode: 'US' }));
const area = (overrides: Partial<ServiceAreaResponse> = {}): ServiceAreaResponse => ({
  id: 'area-n',
  name: 'Riverside north',
  description: 'North of the river',
  active: true,
  postalCodes: codes('78701', '78702', '78703', '78704'),
  ...overrides,
});
const AREAS = [
  area(),
  area({ id: 'area-e', name: 'Eastside', description: undefined, active: false, postalCodes: codes('78721') }),
  area({ id: 'area-0', name: 'Area 10', description: undefined, postalCodes: [] }),
  area({ id: 'area-2', name: 'Area 2', description: undefined, postalCodes: codes('78750') }),
];

const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};
const locationServiceStub = {
  listServiceAreas: vi.fn<() => Observable<{ areas: ServiceAreaResponse[]; ok: boolean }>>(),
  createServiceArea: vi.fn<(request: ServiceAreaRequest) => Observable<ServiceAreaResponse>>(),
  patchServiceArea: vi.fn<(id: string, patch: ServiceAreaPatch) => Observable<ServiceAreaResponse>>(),
  replaceServiceAreaPostalCodes: vi.fn<(id: string, codes: PostalCodeEntry[]) => Observable<ServiceAreaResponse>>(),
};

describe('ServiceAreasPageComponent', () => {
  let fixture: ComponentFixture<ServiceAreasPageComponent>;
  let component: ServiceAreasPageComponent;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const render = (): void => fixture.detectChanges();

  async function setUp(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ServiceAreasPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture = TestBed.createComponent(ServiceAreasPageComponent);
    component = fixture.componentInstance;
    render();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    session.permissions = null;
    locationServiceStub.listServiceAreas.mockReturnValue(of({ areas: AREAS, ok: true }));
  });

  it('lists areas in natural order with status, code counts and samples', async () => {
    await setUp();
    expect(component.rows().map(row => row.name)).toEqual(['Area 2', 'Area 10', 'Eastside', 'Riverside north']);
    const north = el().querySelector('#area-area-n')!.textContent!.replace(/\s+/g, ' ');
    expect(north).toContain('4 postal codes');
    expect(north).toContain('78701, 78702, 78703 and 1 more');
    expect(el().querySelector('#area-area-e')!.textContent).toContain('Units covering it are still matched.');
    expect(el().querySelector('#area-area-0')!.textContent).toContain('No postal codes: covers nobody.');
  });

  it('shows a load failure with a retry', async () => {
    locationServiceStub.listServiceAreas.mockReturnValueOnce(of({ areas: [], ok: false }));
    await setUp();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('LOCATION.SERVICE_AREAS.ERROR.LOAD');
    el().querySelector<HTMLButtonElement>('.retry-btn')!.click();
    render();
    expect(component.state()).toBe('ready');
  });

  it('is view only without location:service-area:manage', async () => {
    session.permissions = [...LOCATION_PAGE.serviceAreas];
    await setUp();
    expect(el().querySelector('.new-area-btn')).toBeNull();
    expect(el().querySelector('.edit-area-btn')).toBeNull();
    expect(text()).toContain("View only: you can't change service areas.");
    component.openCreate();
    expect(component.dialogMode()).toBeNull();
  });

  it('refuses the save in the handler too, whatever dialog is open, without location:service-area:manage', async () => {
    session.permissions = [...LOCATION_PAGE.serviceAreas];
    await setUp();
    // Force a populated dialog past the hidden controls: only the handler guard stands in the way.
    component.dialogMode.set('create');
    component.patchDraft({ name: 'South', countryCode: 'US', postalCodes: codes('78745') });
    component.submit();

    component.dialogMode.set('edit');
    component.editing.set(AREAS[0]);
    component.patchDraft({ name: AREAS[0].name ?? '', description: 'Changed', postalCodes: codes('78745') });
    component.submit();

    expect(locationServiceStub.createServiceArea).not.toHaveBeenCalled();
    expect(locationServiceStub.patchServiceArea).not.toHaveBeenCalled();
    expect(locationServiceStub.replaceServiceAreaPostalCodes).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });

  describe('create', () => {
    beforeEach(async () => setUp());

    it('creates an area with pasted postal codes', () => {
      locationServiceStub.createServiceArea.mockReturnValueOnce(of(area({ id: 'area-s', name: 'South' })));
      component.openCreate();
      component.patchDraft({ name: ' South ', description: 'Below the river' });
      component.pasteText.set('78745, 78745\n78748');
      component.addPasted();
      render();
      expect(text()).toContain('2 added, 1 duplicates ignored.');
      component.submit();

      expect(locationServiceStub.createServiceArea).toHaveBeenCalledWith({
        name: 'South',
        active: true,
        postalCodes: codes('78745', '78748'),
        description: 'Below the river',
      });
      expect(component.dialogMode()).toBeNull();
      expect(component.rows().map(row => row.name)).toContain('South');
    });

    it('needs a name and at least one postal code before sending', () => {
      component.openCreate();
      component.submit();
      expect(component.nameErrorKey()).toBe('LOCATION.SERVICE_AREAS.ERROR.NAME_REQUIRED');
      component.patchDraft({ name: 'South' });
      component.submit();
      render();
      expect(text()).toContain('Add at least one postal code.');
      expect(locationServiceStub.createServiceArea).not.toHaveBeenCalled();
    });

    it('refuses to add codes without a two-letter country', () => {
      component.openCreate();
      component.patchDraft({ countryCode: 'USA' });
      component.pasteText.set('78745');
      component.addPasted();
      render();
      expect(component.countryErrorKey()).toBe('LOCATION.SERVICE_AREAS.ERROR.COUNTRY');
      expect(component.codesErrorKey()).toBeNull();
      expect(component.draft().postalCodes).toEqual([]);
      const country = el().querySelector('#area-country')!;
      expect(country.getAttribute('aria-invalid')).toBe('true');
      expect(el().querySelector(`#${country.getAttribute('aria-describedby')}`)?.textContent).toBeTruthy();

      component.setCountry('us');
      render();
      expect(component.draft().countryCode).toBe('US');
      expect(country.hasAttribute('aria-invalid')).toBe(false);
    });

    it('ties the missing-codes error to the paste box', () => {
      component.openCreate();
      component.patchDraft({ name: 'South' });
      component.submit();
      render();
      const paste = el().querySelector('#area-paste')!;
      expect(paste.getAttribute('aria-invalid')).toBe('true');
      expect(paste.getAttribute('aria-describedby')).toBe('area-codes-error area-paste-hint');
      expect(el().querySelector('#area-codes-error')?.textContent).toContain('Add at least one postal code.');
    });

    it('puts a duplicate name error under Name', () => {
      locationServiceStub.createServiceArea.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.openCreate();
      component.patchDraft({ name: 'Eastside', postalCodes: codes('1') });
      component.submit();
      render();
      expect(el().querySelector('#area-name-error')?.textContent).toContain('Another service area is already called Eastside.');
    });
  });

  describe('edit', () => {
    beforeEach(async () => setUp());

    it('keeps the name fixed and sends details and codes only when they changed', () => {
      const east = AREAS[1];
      locationServiceStub.patchServiceArea.mockReturnValueOnce(of({ ...east, active: true }));
      locationServiceStub.replaceServiceAreaPostalCodes.mockReturnValueOnce(of({ ...east, active: true, postalCodes: codes('78721', '78722') }));
      component.openEdit(east);
      render();
      expect(el().querySelector<HTMLInputElement>('#area-name')?.readOnly).toBe(true);

      component.patchDraft({ active: true });
      component.pasteText.set('78722');
      component.addPasted();
      component.submit();

      expect(locationServiceStub.patchServiceArea).toHaveBeenCalledWith('area-e', { active: true });
      expect(locationServiceStub.replaceServiceAreaPostalCodes).toHaveBeenCalledWith('area-e', codes('78721', '78722'));
      expect(component.areas().find(a => a.id === 'area-e')?.postalCodes?.length).toBe(2);
    });

    it('sends nothing but the postal codes when only they changed', () => {
      const north = AREAS[0];
      locationServiceStub.replaceServiceAreaPostalCodes.mockReturnValueOnce(of({ ...north, postalCodes: codes('78701') }));
      component.openEdit(north);
      component.removeCode(north.postalCodes![1]);
      component.removeCode(north.postalCodes![2]);
      component.removeCode(north.postalCodes![3]);
      component.submit();
      expect(locationServiceStub.patchServiceArea).not.toHaveBeenCalled();
      expect(locationServiceStub.replaceServiceAreaPostalCodes).toHaveBeenCalledWith('area-n', codes('78701'));
    });

    it("won't save an area emptied of postal codes", () => {
      component.openEdit(AREAS[0]);
      component.removeAllCodes();
      component.submit();
      expect(component.codesErrorKey()).toBe('LOCATION.SERVICE_AREAS.ERROR.CODES_REQUIRED');
      expect(locationServiceStub.replaceServiceAreaPostalCodes).not.toHaveBeenCalled();
    });
  });
});
