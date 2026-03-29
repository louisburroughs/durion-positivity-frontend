import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { FeedsComponent } from './feeds.component';
import { ProductInventoryService } from '../../../services/product-inventory.service';
import type { FeedSourceType, SkuAvailability } from '../../../models/availability.models';

describe('FeedsComponent', () => {
  let fixture: ComponentFixture<FeedsComponent>;
  let component: FeedsComponent;

  const mockInventory = {
    queryAvailabilityBySku: vi.fn().mockReturnValue(of([])),
    queryLeadTime: vi.fn().mockReturnValue(of([])),
  };

  const sampleAvailability: SkuAvailability[] = [
    {
      sku: 'SKU-001',
      sourceType: 'MFR' as FeedSourceType,
      onHand: 10,
      reserved: 0,
      atp: 10,
      asOf: new Date().toISOString(),
      locationId: 'LOC-1',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedsComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProductInventoryService, useValue: mockInventory },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  it('defaults activeTab to "MFR"', () => {
    expect(component.activeTab()).toBe('MFR');
  });

  it('initializes with state "idle"', () => {
    expect(component.state()).toBe('idle');
  });

  it('initializes with empty availability list', () => {
    expect(component.availability()).toHaveLength(0);
  });

  it('initializes with empty leadTime list', () => {
    expect(component.leadTime()).toHaveLength(0);
  });

  // ── activeTab signal ──────────────────────────────────────────────────────────

  it('activeTab.set("DISTRIBUTOR") updates activeTab signal', () => {
    component.activeTab.set('DISTRIBUTOR');
    expect(component.activeTab()).toBe('DISTRIBUTOR');
  });

  it('activeTab.set("MFR") resets back to MFR', () => {
    component.activeTab.set('DISTRIBUTOR');
    component.activeTab.set('MFR');
    expect(component.activeTab()).toBe('MFR');
  });

  // ── search() with empty sku ───────────────────────────────────────────────────

  it('search() with empty sku stays in "idle" state', () => {
    component.sku.set('');
    component.search();

    expect(component.state()).toBe('idle');
    expect(mockInventory.queryAvailabilityBySku).not.toHaveBeenCalled();
    expect(mockInventory.queryLeadTime).not.toHaveBeenCalled();
  });

  // ── search() with valid sku ───────────────────────────────────────────────────

  it('search() calls queryAvailabilityBySku and queryLeadTime with active tab', () => {
    mockInventory.queryAvailabilityBySku.mockReturnValueOnce(of(sampleAvailability));
    mockInventory.queryLeadTime.mockReturnValueOnce(of([]));

    component.sku.set('SKU-001');
    component.search();

    expect(mockInventory.queryAvailabilityBySku).toHaveBeenCalledWith('SKU-001', 'MFR');
    expect(mockInventory.queryLeadTime).toHaveBeenCalledWith('SKU-001', 'MFR');
  });

  it('search() uses current activeTab when querying', () => {
    mockInventory.queryAvailabilityBySku.mockReturnValueOnce(of([]));
    mockInventory.queryLeadTime.mockReturnValueOnce(of([]));

    component.sku.set('SKU-001');
    component.activeTab.set('DISTRIBUTOR');
    component.search();

    expect(mockInventory.queryAvailabilityBySku).toHaveBeenCalledWith('SKU-001', 'DISTRIBUTOR');
    expect(mockInventory.queryLeadTime).toHaveBeenCalledWith('SKU-001', 'DISTRIBUTOR');
  });

  it('search() transitions to "ready" when availability is non-empty', () => {
    mockInventory.queryAvailabilityBySku.mockReturnValueOnce(of(sampleAvailability));
    mockInventory.queryLeadTime.mockReturnValueOnce(of([]));

    component.sku.set('SKU-001');
    component.search();

    expect(component.state()).toBe('ready');
  });

  it('search() transitions to "empty" when availability is empty', () => {
    mockInventory.queryAvailabilityBySku.mockReturnValueOnce(of([]));
    mockInventory.queryLeadTime.mockReturnValueOnce(of([]));

    component.sku.set('SKU-001');
    component.search();

    expect(component.state()).toBe('empty');
  });
});
