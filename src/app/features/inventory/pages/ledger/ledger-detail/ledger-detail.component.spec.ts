import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LedgerDetailComponent } from './ledger-detail.component';
import { InventoryService } from '../../../services/inventory.service';

const mockInventoryService = {
  getLedgerEntry: vi.fn(),
};

const mockRoute = {
  snapshot: { paramMap: { get: (key: string) => (key === 'ledgerEntryId' ? 'entry-001' : null) } },
};

describe('LedgerDetailComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LedgerDetailComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(of({ ledgerEntryId: 'entry-001' }));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should be in ready state after successful load', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(of({ ledgerEntryId: 'entry-001' }));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on load failure', () => {
    mockInventoryService.getLedgerEntry.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(LedgerDetailComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBeTruthy();
  });
});
