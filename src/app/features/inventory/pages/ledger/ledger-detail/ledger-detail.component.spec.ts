import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LedgerDetailComponent } from './ledger-detail.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { InventoryLedgerEntry } from '../../../models/inventory.models';

const mockInventoryService = {
  getLedgerEntry: vi.fn(),
};

const mockRoute = {
  snapshot: { paramMap: { get: (key: string) => (key === 'ledgerEntryId' ? 'entry-001' : null) } },
};

const ledgerEntryFixture: InventoryLedgerEntry = {
  ledgerEntryId: 'entry-001',
  timestamp: '2026-01-01T00:00:00Z',
  movementType: 'GOODS_RECEIPT',
  productSku: 'SKU-001',
  quantityChange: 10,
  uom: 'EA',
  fromLocationId: 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f7a8',
  toLocationId: 'b2c3d4e5-f6a7-4890-b123-c4d5e6f7a8b9',
};

describe('LedgerDetailComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LedgerDetailComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: mockInventoryService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(of(ledgerEntryFixture));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should be in ready state after successful load', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(of(ledgerEntryFixture));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on load failure', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.LEDGER.DETAIL.ERROR.LOAD');
  });

  // ADR-0064 §5: neither InventoryLedgerEntry nor the SDK DTO carries a human-readable name
  // for fromLocationId/toLocationId, so the raw UUID must never reach the DOM.
  it('never renders the raw fromLocationId/toLocationId UUID, even when the entry carries one', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(of(ledgerEntryFixture));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain(ledgerEntryFixture.fromLocationId);
    expect(text).not.toContain(ledgerEntryFixture.toLocationId);
  });
});
