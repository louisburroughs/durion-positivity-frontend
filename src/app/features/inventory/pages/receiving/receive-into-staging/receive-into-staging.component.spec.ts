import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReceiveIntoStagingComponent } from './receive-into-staging.component';
import { InventoryReceivingService } from '../../../services/inventory-receiving.service';
import { AsnResponse, ReceivingDocumentResponse } from '../../../models/inventory.models';

const mockReceivingService = {
  getReceivingDocument: vi.fn(),
  confirmReceipt: vi.fn(),
  getAsn: vi.fn(),
  createReceivingSessionFromAsn: vi.fn(),
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

const asnDocFixture: ReceivingDocumentResponse = {
  documentId: 'ASN-001',
  documentType: 'ASN',
  status: 'OPEN',
  locationId: 'loc-01',
  stagingStorageLocationId: 'sl-staging',
  stagingStorageLocationName: 'Staging Area',
  lines: [
    {
      receivingLineId: 'rl-001',
      productSku: 'SKU-001',
      expectedQty: 10,
      expectedUomId: 'EA',
      state: 'PENDING',
      isReceivable: true,
    },
  ],
};

const asnResponseFixture: AsnResponse = {
  asnId: 'asn-001',
  poId: 'po-001',
  status: 'OPEN',
  lines: [{ asnLineId: 'asnl-001', poLineId: 'pol-001', expectedQty: 10 }],
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

describe('ReceiveIntoStagingComponent — ASN paths', () => {
  const asnRoute = {
    snapshot: {
      queryParamMap: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === 'asnId') return 'asn-001';
          if (key === 'locationId') return 'loc-01';
          return null;
        }),
      },
    },
  };

  const fallbackRoute = {
    snapshot: {
      queryParamMap: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === 'documentId') return 'doc-1';
          if (key === 'documentType') return 'PO';
          return null;
        }),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ASN path loads receiving session from ASN service and sets state ready', async () => {
    mockReceivingService.getAsn.mockReturnValue(of(asnResponseFixture));
    mockReceivingService.createReceivingSessionFromAsn.mockReturnValue(of(asnDocFixture));

    await TestBed.configureTestingModule({
      imports: [ReceiveIntoStagingComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryReceivingService, useValue: mockReceivingService },
        { provide: ActivatedRoute, useValue: asnRoute },
      ],
    }).compileComponents();

    const component = TestBed.createComponent(ReceiveIntoStagingComponent).componentInstance;

    expect(component.asnMode()).toBe('asn-entry');
    expect(component.state()).toBe('ready');
    expect(component.document()).toEqual(asnDocFixture);
    expect(mockReceivingService.getAsn).toHaveBeenCalledWith('asn-001');
    expect(mockReceivingService.createReceivingSessionFromAsn).toHaveBeenCalledWith({
      asnId: 'asn-001',
      locationId: 'loc-01',
    });
  });

  it('fallback path still works when asnMode is fallback', async () => {
    mockReceivingService.getReceivingDocument.mockReturnValue(of(receivingDocFixture));

    await TestBed.configureTestingModule({
      imports: [ReceiveIntoStagingComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryReceivingService, useValue: mockReceivingService },
        { provide: ActivatedRoute, useValue: fallbackRoute },
      ],
    }).compileComponents();

    const component = TestBed.createComponent(ReceiveIntoStagingComponent).componentInstance;

    expect(component.asnMode()).toBe('fallback');
    expect(component.state()).toBe('ready');
    expect(mockReceivingService.getReceivingDocument).toHaveBeenCalledWith('doc-1', 'PO');
  });

  it('ASN load error sets state error before errorKey (ADR-0031)', async () => {
    mockReceivingService.getAsn.mockReturnValue(throwError(() => new Error('asn fetch failed')));

    await TestBed.configureTestingModule({
      imports: [ReceiveIntoStagingComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryReceivingService, useValue: mockReceivingService },
        { provide: ActivatedRoute, useValue: asnRoute },
      ],
    }).compileComponents();

    const component = TestBed.createComponent(ReceiveIntoStagingComponent).componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.RECEIVING.ERROR.ASN_LOAD');
  });
});
