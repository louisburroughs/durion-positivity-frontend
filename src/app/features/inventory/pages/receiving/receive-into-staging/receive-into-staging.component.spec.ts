import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReceiveIntoStagingComponent } from './receive-into-staging.component';
import { InventoryReceivingService } from '../../../services/inventory-receiving.service';
import { ReceivingDocumentResponse } from '../../../models/inventory.models';

const mockReceivingService = {
  getReceivingDocument: vi.fn(),
  confirmReceipt: vi.fn(),
};

const receivingDocFixture: ReceivingDocumentResponse = {
  documentId: 'doc-1',
  documentType: 'PO',
  status: 'OPEN',
  locationId: 'loc-001',
  stagingStorageLocationId: 'sl-001',
  stagingStorageLocationName: 'Staging 1',
  lines: [],
};

describe('ReceiveIntoStagingComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ReceiveIntoStagingComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryReceivingService, useValue: mockReceivingService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should start in idle state', () => {
    const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('should transition to ready after successful document load', () => {
    mockReceivingService.getReceivingDocument.mockReturnValue(of(receivingDocFixture));
    const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
    const component = fixture.componentInstance;

    component.loadDocument('doc-1', 'PO');

    expect(component.state()).toBe('ready');
  });

  it('should set error state before errorKey on load failure', () => {
    mockReceivingService.getReceivingDocument.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.loadDocument('doc-1', 'PO');

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });

  describe('updateLineQty', () => {
    it('should ignore NaN input and keep existing value', () => {
      const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
      const component = fixture.componentInstance;
      component.lineQuantities.set({ 'line-1': 5 });
      component.updateLineQty('line-1', Number.NaN);
      expect(component.lineQuantities()['line-1']).toBe(5);
    });

    it('should clamp negative input to 0', () => {
      const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
      const component = fixture.componentInstance;
      component.updateLineQty('line-1', -5);
      expect(component.lineQuantities()['line-1']).toBe(0);
    });
  });
});
