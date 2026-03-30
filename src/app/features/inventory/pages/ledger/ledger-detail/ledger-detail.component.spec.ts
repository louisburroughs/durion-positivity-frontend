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
  movementType: 'RECEIPT',
  productSku: 'SKU-001',
  quantityChange: 10,
  uom: 'EA',
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
});
