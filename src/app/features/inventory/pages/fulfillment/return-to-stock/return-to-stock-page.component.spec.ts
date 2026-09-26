import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReturnToStockPageComponent } from './return-to-stock-page.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  LocationRef,
  ReturnReasonCode,
  ReturnToStockResult,
  ReturnableItem,
  StorageLocation,
} from '../../../models/inventory.models';

const mockInventoryService = {
  getReturnableItems: vi.fn(),
  getReasonCodes: vi.fn(),
  getLocations: vi.fn(),
  getStorageLocations: vi.fn(),
  submitReturnToStock: vi.fn(),
};

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: ['inventory:return:write'] };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
};

const returnableItemsFixture: ReturnableItem[] = [
  {
    workorderLineId: 'line-001',
    productSku: 'SKU-001',
    description: 'Brake pad',
    maxReturnableQty: 4,
    uom: 'EA',
  },
];

const reasonCodesFixture: ReturnReasonCode[] = [
  { code: 'UNUSED', label: 'Unused part' },
];

const locationsFixture: LocationRef[] = [
  { locationId: 'loc-01', name: 'Main Warehouse', status: 'ACTIVE' },
];

const storageLocationsFixture: StorageLocation[] = [
  {
    storageLocationId: 'sloc-01',
    locationId: 'loc-02',
    name: 'Aisle A Bin 1',
    status: 'ACTIVE',
  },
];

const returnResultFixture: ReturnToStockResult = {
  returnId: 'ret-001',
  workorderId: 'wo-001',
  processedLineCount: 2,
};

function buildRoute(workorderId: string | null = 'wo-001') {
  return {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue(workorderId) } },
  };
}

async function setupReturnToStock(workorderId: string | null = 'wo-001') {
  mockInventoryService.getReturnableItems.mockReturnValue(of(returnableItemsFixture));
  mockInventoryService.getReasonCodes.mockReturnValue(of(reasonCodesFixture));
  mockInventoryService.getLocations.mockReturnValue(of(locationsFixture));

  await TestBed.configureTestingModule({
    imports: [ReturnToStockPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryDomainService, useValue: mockInventoryService },
      { provide: AuthService, useValue: authStub },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ReturnToStockPageComponent).componentInstance;
}

async function setupReturnToStockFixture(
  workorderId: string | null = 'wo-001',
): Promise<ComponentFixture<ReturnToStockPageComponent>> {
  mockInventoryService.getReturnableItems.mockReturnValue(of(returnableItemsFixture));
  mockInventoryService.getReasonCodes.mockReturnValue(of(reasonCodesFixture));
  mockInventoryService.getLocations.mockReturnValue(of(locationsFixture));

  await TestBed.configureTestingModule({
    imports: [ReturnToStockPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryDomainService, useValue: mockInventoryService },
      { provide: AuthService, useValue: authStub },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ReturnToStockPageComponent);
}

describe('ReturnToStockPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.permissions = ['inventory:return:write'];
    mockInventoryService.getStorageLocations.mockReturnValue(of([]));
  });

  it('forkJoin success loads items and sets state ready', async () => {
    const component = await setupReturnToStock();

    expect(component.state()).toBe('ready');
    expect(component.items()).toEqual(returnableItemsFixture);
    expect(component.reasonCodes()).toEqual(reasonCodesFixture);
    expect(component.locations()).toEqual(locationsFixture);
  });

  it('canSubmit is false when no qty entered', async () => {
    const component = await setupReturnToStock();

    // no returnQtys set
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when location not selected', async () => {
    const component = await setupReturnToStock();

    component.returnQtys.set({ 'line-001': 2 });
    component.selectedReasonCode.set('UNUSED');
    // no location set

    expect(component.canSubmit()).toBe(false);
  });

  it('submit error sets state error before errorKey (ADR-0031)', async () => {
    mockInventoryService.submitReturnToStock.mockReturnValue(
      throwError(() => new Error('submit failed')),
    );
    const component = await setupReturnToStock();

    component.selectedLocationId.set('loc-01');
    component.selectedReasonCode.set('UNUSED');
    component.returnQtys.set({ 'line-001': 2 });

    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => {
      calls.push(`state:${v}`);
      origState(v);
    });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => {
      if (v !== null) calls.push(`errorKey:${v}`);
      origError(v);
    });

    component.submit();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.SUBMIT');
  });

  it('submit error maps a 422 to the QUANTITY_EXCEEDED key (backend RETURN_QUANTITY_EXCEEDED)', async () => {
    mockInventoryService.submitReturnToStock.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'RETURN_QUANTITY_EXCEEDED' } })),
    );
    const component = await setupReturnToStock();

    component.selectedLocationId.set('loc-01');
    component.selectedReasonCode.set('UNUSED');
    component.returnQtys.set({ 'line-001': 2 });

    component.submit();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.QUANTITY_EXCEEDED');
  });

  it('submit error maps a 404 to the LINE_NOT_FOUND key (unknown workorderLineId)', async () => {
    mockInventoryService.submitReturnToStock.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    const component = await setupReturnToStock();

    component.selectedLocationId.set('loc-01');
    component.selectedReasonCode.set('UNUSED');
    component.returnQtys.set({ 'line-001': 2 });

    component.submit();

    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.LINE_NOT_FOUND');
  });

  it('submit error maps a 400 to the VALIDATION key', async () => {
    mockInventoryService.submitReturnToStock.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400 })),
    );
    const component = await setupReturnToStock();

    component.selectedLocationId.set('loc-01');
    component.selectedReasonCode.set('UNUSED');
    component.returnQtys.set({ 'line-001': 2 });

    component.submit();

    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.VALIDATION');
  });

  it('submit success sets state to success', async () => {
    mockInventoryService.submitReturnToStock.mockReturnValue(of(returnResultFixture));
    const component = await setupReturnToStock();

    component.selectedLocationId.set('loc-01');
    component.selectedReasonCode.set('UNUSED');
    component.returnQtys.set({ 'line-001': 2 });

    component.submit();

    expect(component.state()).toBe('success');
    expect(component.submitResult()).toEqual(returnResultFixture);
  });

  it('recovers from storage-location load error on subsequent successful location change', async () => {
    mockInventoryService.getStorageLocations.mockImplementation((locationId: string) => (
      locationId === 'loc-01'
        ? throwError(() => new Error('storage failed'))
        : of(storageLocationsFixture)
    ));
    const fixture = await setupReturnToStockFixture();
    const component = fixture.componentInstance;

    fixture.detectChanges();

    component.selectedLocationId.set('loc-01');
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.STORAGE_LOCATIONS');

    component.selectedLocationId.set('loc-02');
    fixture.detectChanges();

    expect(component.storageLocations()).toEqual(storageLocationsFixture);
    expect(component.errorKey()).toBeNull();
    expect(component.state()).toBe('ready');
  });

  it('returnQtys input renders 0 by default for unset items', async () => {
    const fixture = await setupReturnToStockFixture();

    fixture.detectChanges();

    const inputEl = fixture.nativeElement.querySelector(
      '#return-qty-line-001',
    ) as HTMLInputElement;
    expect(inputEl).not.toBeNull();
    expect(inputEl.value).toBe('0');
  });

  describe('write authority gating (ADR-0040 §6a)', () => {
    it('denied (view-only session): submit button disabled and submit() does not call the service', async () => {
      session.permissions = ['inventory:return:view'];
      const fixture = await setupReturnToStockFixture();
      const component = fixture.componentInstance;

      component.selectedLocationId.set('loc-01');
      component.selectedReasonCode.set('UNUSED');
      component.returnQtys.set({ 'line-001': 2 });
      fixture.detectChanges();

      expect(component.canSubmit()).toBe(false);
      const submitButton = fixture.nativeElement.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(true);

      component.submit();
      expect(mockInventoryService.submitReturnToStock).not.toHaveBeenCalled();
    });

    it('unknown permissions (permissionsKnown false): submit is allowed', async () => {
      session.permissions = null;
      mockInventoryService.submitReturnToStock.mockReturnValue(of(returnResultFixture));
      const component = await setupReturnToStock();

      component.selectedLocationId.set('loc-01');
      component.selectedReasonCode.set('UNUSED');
      component.returnQtys.set({ 'line-001': 2 });

      expect(component.canSubmit()).toBe(true);

      component.submit();
      expect(mockInventoryService.submitReturnToStock).toHaveBeenCalledTimes(1);
    });
  });
});
