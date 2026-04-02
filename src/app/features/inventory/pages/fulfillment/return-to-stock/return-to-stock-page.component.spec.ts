import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReturnToStockPageComponent } from './return-to-stock-page.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import {
  LocationRef,
  ReturnReasonCode,
  ReturnToStockResult,
  ReturnableItem,
} from '../../../models/inventory.models';

const mockInventoryService = {
  getReturnableItems: vi.fn(),
  getReasonCodes: vi.fn(),
  getLocations: vi.fn(),
  getStorageLocations: vi.fn(),
  submitReturnToStock: vi.fn(),
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

const returnResultFixture: ReturnToStockResult = {
  returnId: 'ret-001',
  workorderId: 'wo-001',
  totalItemsReturned: 2,
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
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ReturnToStockPageComponent).componentInstance;
}

describe('ReturnToStockPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
