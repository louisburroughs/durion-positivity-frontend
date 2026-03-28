import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { LocationSyncPageComponent } from './location-sync-page.component';
import { InventoryService } from '../../services/inventory.service';

const INVENTORY_LOCATIONS = [
  { locationId: 'L-1', name: 'Main', status: 'ACTIVE', timezone: 'UTC' },
];

const SYNC_LOGS = [
  { syncRunId: 'RUN-1', outcome: 'SUCCESS', createdAt: '2025-01-01T00:00:00Z', correlationId: 'CORR-1' },
];

const stubInventoryService = {
  listInventoryLocations: vi.fn(),
  listSyncLogs: vi.fn(),
  triggerLocationSync: vi.fn(),
};

describe('LocationSyncPageComponent [CAP-214 #104]', () => {
  let fixture: ComponentFixture<LocationSyncPageComponent>;
  let component: LocationSyncPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubInventoryService.listInventoryLocations.mockReturnValue(of(INVENTORY_LOCATIONS));
    stubInventoryService.listSyncLogs.mockReturnValue(of(SYNC_LOGS));
    stubInventoryService.triggerLocationSync.mockReturnValue(of({ syncRunId: 'RUN-NEW' }));

    await TestBed.configureTestingModule({
      imports: [LocationSyncPageComponent],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: stubInventoryService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationSyncPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('should load inventory locations on init', async () => {
    await setup();
    expect(stubInventoryService.listInventoryLocations).toHaveBeenCalledWith({ pageSize: 50 });
    expect(component.inventoryLocations()).toHaveLength(1);
    expect((component.inventoryLocations()[0] as Record<string, unknown>)['locationId']).toBe('L-1');
  });

  it('should render locations table with row data', async () => {
    await setup();
    const table = fixture.debugElement.query(By.css('[data-testid="inventory-locations-table"]'));
    expect(table).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('[data-testid^="inventory-location-row-"]'));
    expect(rows.length).toBe(1);
    expect(rows[0].nativeElement.textContent).toContain('L-1');
    expect(rows[0].nativeElement.textContent).toContain('Main');
  });

  it('should load sync logs on init', async () => {
    await setup();
    expect(stubInventoryService.listSyncLogs).toHaveBeenCalledWith({ pageSize: 20 });
    expect(component.syncLogs()).toHaveLength(1);
    expect((component.syncLogs()[0] as Record<string, unknown>)['syncRunId']).toBe('RUN-1');
  });

  it('should render sync logs table with row data', async () => {
    await setup();
    const table = fixture.debugElement.query(By.css('[data-testid="sync-logs-table"]'));
    expect(table).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('[data-testid^="sync-log-row-"]'));
    expect(rows.length).toBe(1);
    expect(rows[0].nativeElement.textContent).toContain('RUN-1');
    expect(rows[0].nativeElement.textContent).toContain('SUCCESS');
  });

  it('should show loading state for locations', async () => {
    await setup();
    component.loading.set(true);
    fixture.detectChanges();
    const indicator = fixture.debugElement.query(By.css('[data-testid="locations-loading"]'));
    expect(indicator).toBeTruthy();
  });

  it('should trigger sync and show syncRunId', async () => {
    await setup();
    component.triggerSync();
    fixture.detectChanges();
    expect(stubInventoryService.triggerLocationSync).toHaveBeenCalledWith(expect.any(String));
    expect(component.triggerSuccess()).toBe(true);
    expect(component.lastSyncRunId()).toBe('RUN-NEW');
    const successEl = fixture.debugElement.query(By.css('[data-testid="trigger-success"]'));
    expect(successEl).toBeTruthy();
    const runIdEl = fixture.debugElement.query(By.css('[data-testid="sync-run-id"]'));
    expect(runIdEl).toBeTruthy();
    expect(runIdEl.nativeElement.textContent.trim()).toBe('RUN-NEW');
  });

  it('should show trigger error on failure', async () => {
    await setup();
    stubInventoryService.triggerLocationSync.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 500, error: { message: 'Sync failed' } }),
      ),
    );
    component.triggerSync();
    fixture.detectChanges();
    expect(component.triggerError()).toBe('Sync failed');
    const errorEl = fixture.debugElement.query(By.css('[data-testid="trigger-error"]'));
    expect(errorEl).toBeTruthy();
    expect(errorEl.nativeElement.textContent).toContain('Sync failed');
  });

  it('should disable trigger-sync button when triggering', async () => {
    await setup();
    component.triggering.set(true);
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="trigger-sync-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });
});
