import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LedgerListComponent } from './ledger-list.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { InventoryLedgerEntry, LedgerPageResponse } from '../../../models/inventory.models';

const mockInventoryService = {
  queryLedger: vi.fn(),
};

const ledgerEntryItem: InventoryLedgerEntry = {
  ledgerEntryId: 'e1',
  timestamp: '2026-01-01T00:00:00Z',
  movementType: 'GOODS_RECEIPT',
  productSku: 'SKU-001',
  quantityChange: 10,
  uom: 'EA',
  fromLocationId: 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f7a8',
  toLocationId: 'b2c3d4e5-f6a7-4890-b123-c4d5e6f7a8b9',
};

const ledgerPageWithItems: LedgerPageResponse = { items: [ledgerEntryItem], nextPageToken: null };
const emptyLedgerPage: LedgerPageResponse = { items: [], nextPageToken: null };

describe('LedgerListComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LedgerListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: mockInventoryService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(LedgerListComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should start in idle state', () => {
    const fixture = TestBed.createComponent(LedgerListComponent);
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('should transition to ready after successful search', () => {
    mockInventoryService.queryLedger.mockReturnValue(of(ledgerPageWithItems));
    const fixture = TestBed.createComponent(LedgerListComponent);
    const component = fixture.componentInstance;

    component.applyFilter({});

    expect(component.state()).toBe('ready');
    expect(component.entries()).toHaveLength(1);
  });

  it('should set empty state when no entries returned', () => {
    mockInventoryService.queryLedger.mockReturnValue(of(emptyLedgerPage));
    const fixture = TestBed.createComponent(LedgerListComponent);
    const component = fixture.componentInstance;

    component.applyFilter({});

    expect(component.state()).toBe('empty');
  });

  it('should set error state before errorKey on failure', () => {
    mockInventoryService.queryLedger.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(LedgerListComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.applyFilter({});

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });

  // ADR-0064 §5: neither InventoryLedgerEntry nor the SDK DTO carries a human-readable name
  // for fromLocationId/toLocationId, so the raw UUID must never reach the DOM.
  it('never renders the raw fromLocationId/toLocationId UUID, even when a row carries one', () => {
    mockInventoryService.queryLedger.mockReturnValue(of(ledgerPageWithItems));
    const fixture = TestBed.createComponent(LedgerListComponent);
    const component = fixture.componentInstance;

    component.applyFilter({});
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain(ledgerEntryItem.fromLocationId);
    expect(text).not.toContain(ledgerEntryItem.toLocationId);
  });
});
