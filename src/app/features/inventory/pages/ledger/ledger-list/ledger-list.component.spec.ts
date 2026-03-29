import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LedgerListComponent } from './ledger-list.component';
import { InventoryService } from '../../../services/inventory.service';

const mockInventoryService = {
  queryLedger: vi.fn(),
};

describe('LedgerListComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LedgerListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: mockInventoryService },
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
    mockInventoryService.queryLedger.mockReturnValue(of({ items: [{ ledgerEntryId: 'e1' }], nextPageToken: null }));
    const fixture = TestBed.createComponent(LedgerListComponent);
    const component = fixture.componentInstance;

    component.applyFilter({});

    expect(component.state()).toBe('ready');
    expect(component.entries()).toHaveLength(1);
  });

  it('should set empty state when no entries returned', () => {
    mockInventoryService.queryLedger.mockReturnValue(of({ items: [], nextPageToken: null }));
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
});
