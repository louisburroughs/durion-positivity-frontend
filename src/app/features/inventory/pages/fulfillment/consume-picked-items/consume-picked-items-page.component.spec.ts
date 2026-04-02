import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ConsumePickedItemsPageComponent } from './consume-picked-items-page.component';
import { WorkexecService } from '../../../../workexec/services/workexec.service';
import { PickedItemLine } from '../../../../workexec/models/workexec.models';

const mockWorkexecService = {
  getPickedItems: vi.fn(),
  consumePickedItems: vi.fn(),
};

const pickedItemsFixture: PickedItemLine[] = [
  {
    pickedItemId: 'pi-001',
    productSku: 'SKU-001',
    qtyPicked: 5,
    qtyConsumed: 0,
    status: 'PICKED',
  },
  {
    pickedItemId: 'pi-002',
    productSku: 'SKU-002',
    qtyPicked: 3,
    qtyConsumed: 0,
    status: 'PICKED',
  },
];

function buildRoute(workorderId: string | null = 'wo-001') {
  return {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue(workorderId) } },
  };
}

async function setupConsumeItems(workorderId: string | null = 'wo-001') {
  await TestBed.configureTestingModule({
    imports: [ConsumePickedItemsPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: WorkexecService, useValue: mockWorkexecService },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ConsumePickedItemsPageComponent).componentInstance;
}

async function setupConsumeItemsFixture(
  workorderId: string | null = 'wo-001',
): Promise<ComponentFixture<ConsumePickedItemsPageComponent>> {
  await TestBed.configureTestingModule({
    imports: [ConsumePickedItemsPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: WorkexecService, useValue: mockWorkexecService },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ConsumePickedItemsPageComponent);
}

describe('ConsumePickedItemsPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads picked items on init and sets state ready', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const component = await setupConsumeItems();

    expect(component.state()).toBe('ready');
    expect(component.items()).toEqual(pickedItemsFixture);
  });

  it('canSubmit is false when all consume qtys are 0', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const component = await setupConsumeItems();

    // consumeQtys reset to {} after load
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is true when at least one consume qty > 0', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const component = await setupConsumeItems();

    component.consumeQtys.set({ 'pi-001': 3 });

    expect(component.canSubmit()).toBe(true);
  });

  it('submit success enters success state', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    mockWorkexecService.consumePickedItems.mockReturnValue(
      of({ referenceId: 'ref-001', consumedLineCount: 1 }),
    );
    const component = await setupConsumeItems();

    component.consumeQtys.set({ 'pi-001': 3 });
    component.submit();

    expect(component.state()).toBe('success');
  });

  it('error sets state error before errorKey (ADR-0031)', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    mockWorkexecService.consumePickedItems.mockReturnValue(
      throwError(() => new Error('submit failed')),
    );
    const component = await setupConsumeItems();

    component.consumeQtys.set({ 'pi-001': 3 });

    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => {
      calls.push(`state:${v}`);
      origState(v);
    });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => {
      if (v !== null) calls.push(`errorKey:${v}`);
      origError(v);
    });

    component.submit();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe(
      'INVENTORY.FULFILLMENT.CONSUME_PICKED_ITEMS.ERROR.SUBMIT',
    );
  });

  it('load error sets state error before errorKey (ADR-0031)', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(
      throwError(() => new Error('network error')),
    );
    const component = await setupConsumeItems();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe(
      'INVENTORY.FULFILLMENT.CONSUME_PICKED_ITEMS.ERROR.LOAD',
    );
  });

  it('renders consume qty input default as 0 when no quantity is preset', async () => {
    mockWorkexecService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const fixture = await setupConsumeItemsFixture();

    fixture.detectChanges();

    const input: HTMLInputElement | null = fixture.nativeElement.querySelector('#consume-qty-pi-001');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('0');
  });
});
