import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import type { TravelBufferPolicyRequest, TravelBufferPolicyResponse } from '@durion-sdk/location';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import type { TravelBufferPolicyPatch } from '../../models/setup-lists.models';
import { LocationService } from '../../services/location.service';
import { TravelBufferPoliciesPageComponent } from './travel-buffer-policies-page.component';

const POLICIES: TravelBufferPolicyResponse[] = [
  { id: 'p-std', name: 'Standard', bufferType: 'FLAT_MINUTES', bufferValue: 15, notes: 'Most visits' },
  { id: 'p-pct', name: 'Rush hour', bufferType: 'PERCENTAGE_OF_TRAVEL', bufferValue: 20 },
  { id: 'p-bad', name: 'Seeded', bufferType: 'MINUTES', bufferValue: 10 },
];

const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};
const locationServiceStub = {
  listTravelBufferPolicies: vi.fn<() => Observable<{ policies: TravelBufferPolicyResponse[]; ok: boolean }>>(),
  createTravelBufferPolicy: vi.fn<(request: TravelBufferPolicyRequest) => Observable<TravelBufferPolicyResponse>>(),
  patchTravelBufferPolicy: vi.fn<(id: string, patch: TravelBufferPolicyPatch) => Observable<TravelBufferPolicyResponse>>(),
};

describe('TravelBufferPoliciesPageComponent', () => {
  let fixture: ComponentFixture<TravelBufferPoliciesPageComponent>;
  let component: TravelBufferPoliciesPageComponent;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const render = (): void => fixture.detectChanges();

  async function setUp(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TravelBufferPoliciesPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture = TestBed.createComponent(TravelBufferPoliciesPageComponent);
    component = fixture.componentInstance;
    render();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    session.permissions = null;
    locationServiceStub.listTravelBufferPolicies.mockReturnValue(of({ policies: POLICIES, ok: true }));
  });

  it('says buffers are not applied yet, and lists each buffer in words', async () => {
    await setUp();
    expect(text()).toContain("Travel buffers are recorded on mobile units. Scheduling doesn't use them yet.");
    expect(el().querySelector('#policy-p-std')!.textContent).toContain('15 minutes flat');
    expect(el().querySelector('#policy-p-pct')!.textContent).toContain('20% of travel time');
    expect(el().querySelector('#policy-p-bad')!.textContent).toContain('Type needs fixing');
  });

  it('shows a policy with no value as no buffer, never as zero', async () => {
    locationServiceStub.listTravelBufferPolicies.mockReturnValue(
      of({ policies: [{ id: 'p-none', name: 'None', bufferType: 'FLAT_MINUTES' }], ok: true }),
    );
    await setUp();
    const row = el().querySelector('#policy-p-none')!.textContent ?? '';
    expect(row).toContain('no buffer');
    expect(row).not.toContain('0 minutes');
  });

  it('shows a load failure with a retry', async () => {
    locationServiceStub.listTravelBufferPolicies.mockReturnValueOnce(of({ policies: [], ok: false }));
    await setUp();
    expect(component.state()).toBe('error');
    el().querySelector<HTMLButtonElement>('.retry-btn')!.click();
    render();
    expect(component.state()).toBe('ready');
  });

  it('is view only without location:travel-buffer-policy:manage', async () => {
    session.permissions = [...LOCATION_PAGE.travelBufferPolicies];
    await setUp();
    expect(el().querySelector('.new-policy-btn')).toBeNull();
    expect(el().querySelector('.edit-policy-btn')).toBeNull();
    component.openEdit(POLICIES[0]);
    expect(component.dialogMode()).toBeNull();
  });

  describe('create and edit', () => {
    beforeEach(async () => setUp());

    it('creates a policy, showing the unit for the chosen type', () => {
      locationServiceStub.createTravelBufferPolicy.mockReturnValueOnce(
        of({ id: 'p-new', name: 'Long haul', bufferType: 'DISTANCE_MULTIPLIER', bufferValue: 1.5 }),
      );
      component.openCreate();
      component.patchDraft({ name: ' Long haul ', bufferValue: '1.5' });
      component.setType('DISTANCE_MULTIPLIER');
      render();
      expect(el().querySelector('.suffix')?.textContent).toBe('× distance');
      component.submit();
      expect(locationServiceStub.createTravelBufferPolicy).toHaveBeenCalledWith({
        name: 'Long haul',
        bufferType: 'DISTANCE_MULTIPLIER',
        bufferValue: 1.5,
      });
      expect(component.rows().map(row => row.name)).toContain('Long haul');
    });

    it('checks name, type and value before sending', () => {
      component.openCreate();
      component.setType('');
      component.patchDraft({ bufferValue: '-2' });
      component.submit();
      expect(component.nameErrorKey()).toBe('LOCATION.TRAVEL_BUFFERS.ERROR.NAME_REQUIRED');
      expect(component.typeErrorKey()).toBe('LOCATION.TRAVEL_BUFFERS.ERROR.TYPE_REQUIRED');
      expect(component.valueErrorKey()).toBe('LOCATION.TRAVEL_BUFFERS.ERROR.VALUE');
      expect(locationServiceStub.createTravelBufferPolicy).not.toHaveBeenCalled();
    });

    it('patches only what changed, and can clear the value', () => {
      locationServiceStub.patchTravelBufferPolicy.mockReturnValueOnce(of({ ...POLICIES[0], bufferValue: undefined }));
      component.openEdit(POLICIES[0]);
      render();
      expect(el().querySelector<HTMLInputElement>('#policy-name')?.readOnly).toBe(true);
      component.patchDraft({ bufferValue: '' });
      component.submit();
      expect(locationServiceStub.patchTravelBufferPolicy).toHaveBeenCalledWith('p-std', { bufferValue: null });
    });

    it('makes a seeded policy with an invalid type choose a valid one', () => {
      locationServiceStub.patchTravelBufferPolicy.mockReturnValueOnce(of({ ...POLICIES[2], bufferType: 'FLAT_MINUTES' }));
      component.openEdit(POLICIES[2]);
      component.submit();
      expect(component.typeErrorKey()).toBe('LOCATION.TRAVEL_BUFFERS.ERROR.TYPE_REQUIRED');
      expect(locationServiceStub.patchTravelBufferPolicy).not.toHaveBeenCalled();

      component.setType('FLAT_MINUTES');
      component.submit();
      expect(locationServiceStub.patchTravelBufferPolicy).toHaveBeenCalledWith('p-bad', { bufferType: 'FLAT_MINUTES' });
    });

    it('puts a duplicate name error under Name', () => {
      locationServiceStub.createTravelBufferPolicy.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.openCreate();
      component.patchDraft({ name: 'Standard' });
      component.submit();
      render();
      expect(el().querySelector('#policy-name-error')?.textContent).toContain('Another policy is already called Standard.');
    });
  });
});
