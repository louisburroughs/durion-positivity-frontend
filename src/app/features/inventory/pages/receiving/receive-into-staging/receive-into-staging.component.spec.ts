import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReceiveIntoStagingComponent } from './receive-into-staging.component';
import { InventoryReceivingService } from '../../../services/inventory-receiving.service';

const mockReceivingService = {
  getReceivingDocument: vi.fn(),
  confirmReceipt: vi.fn(),
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
    mockReceivingService.getReceivingDocument.mockReturnValue(of({ documentId: 'doc-1', lines: [] }));
    const fixture = TestBed.createComponent(ReceiveIntoStagingComponent);
    const component = fixture.componentInstance;

    component.loadDocument('PO', 'doc-1');

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

    component.loadDocument('PO', 'doc-1');

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });
});
