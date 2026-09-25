import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ConsumePickedItemsPageComponent } from './consume-picked-items-page.component';
import { InventoryPickService } from '../../../services/inventory-pick.service';
import { PickedItemLine } from '../../../models/inventory-pick.models';
import { AuthService } from '../../../../../core/services/auth.service';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';

const mockPickService = {
  getPickedItems: vi.fn(),
  consumePickedItems: vi.fn(),
};

const CONSUME = INVENTORY_PAGE.consumeItems[0];

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
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

async function setupConsumeItems(workorderId: string | null = 'wo-001', permissions: string[] | null = null) {
  session.permissions = permissions;
  await TestBed.configureTestingModule({
    imports: [ConsumePickedItemsPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryPickService, useValue: mockPickService },
      { provide: AuthService, useValue: authStub },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ConsumePickedItemsPageComponent).componentInstance;
}

async function setupConsumeItemsFixture(
  workorderId: string | null = 'wo-001',
  permissions: string[] | null = null,
): Promise<ComponentFixture<ConsumePickedItemsPageComponent>> {
  session.permissions = permissions;
  await TestBed.configureTestingModule({
    imports: [ConsumePickedItemsPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryPickService, useValue: mockPickService },
      { provide: AuthService, useValue: authStub },
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
    mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const component = await setupConsumeItems();

    expect(component.state()).toBe('ready');
    expect(component.items()).toEqual(pickedItemsFixture);
  });

  it('canSubmit is false when all consume qtys are 0', async () => {
    mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const component = await setupConsumeItems();

    // consumeQtys reset to {} after load
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is true when at least one consume qty > 0', async () => {
    mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const component = await setupConsumeItems();

    component.consumeQtys.set({ 'pi-001': 3 });

    expect(component.canSubmit()).toBe(true);
  });

  it('submit success enters success state', async () => {
    mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    mockPickService.consumePickedItems.mockReturnValue(
      of({ referenceId: 'ref-001', consumedLineCount: 1 }),
    );
    const component = await setupConsumeItems();

    component.consumeQtys.set({ 'pi-001': 3 });
    component.submit();

    expect(component.state()).toBe('success');
  });

  it('error sets state error before errorKey (ADR-0031)', async () => {
    mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    mockPickService.consumePickedItems.mockReturnValue(
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
    mockPickService.getPickedItems.mockReturnValue(
      throwError(() => new Error('network error')),
    );
    const component = await setupConsumeItems();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe(
      'INVENTORY.FULFILLMENT.CONSUME_PICKED_ITEMS.ERROR.LOAD',
    );
  });

  it('renders consume qty input default as 0 when no quantity is preset', async () => {
    mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
    const fixture = await setupConsumeItemsFixture();

    fixture.detectChanges();

    const input: HTMLInputElement | null = fixture.nativeElement.querySelector('#consume-qty-pi-001');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('0');
  });

  // ADR-0040 §6a.1/§6a.5: the submit control and submit() gate on
  // workorder:parts:consume — what WorkorderPickedItemsController actually
  // enforces — not inventory:pick_list:execute (issue #347 group 5).
  describe('permissions (workorder:parts:consume)', () => {
    it('allows submit for a session holding workorder:parts:consume', async () => {
      mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
      mockPickService.consumePickedItems.mockReturnValue(of({ referenceId: 'ref-001', consumedLineCount: 1 }));
      const component = await setupConsumeItems('wo-001', [CONSUME]);

      expect(component.canConsume()).toBe(true);

      component.consumeQtys.set({ 'pi-001': 3 });
      component.submit();

      expect(mockPickService.consumePickedItems).toHaveBeenCalledTimes(1);
      expect(component.state()).toBe('success');
    });

    it('refuses submit for a session holding only inventory:pick_list:execute (the split between authorities)', async () => {
      mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
      const fixture = await setupConsumeItemsFixture('wo-001', ['inventory:pick_list:execute']);
      const component = fixture.componentInstance;

      expect(component.canConsume()).toBe(false);

      // Independent control assertion (ADR-0040 §6a.5): the submit button
      // itself must be disabled, not only the method's imperative refusal —
      // a regression removing the template's [disabled] binding would
      // otherwise pass while this session could still click a live button.
      component.consumeQtys.set({ 'pi-001': 3 });
      fixture.detectChanges();

      const submitButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.action-bar button.btn-primary');
      expect(submitButton?.disabled).toBe(true);

      component.submit();

      expect(mockPickService.consumePickedItems).not.toHaveBeenCalled();
    });

    it('treats an unknown permission claim (legacy token) as granted, matching canAccess()', async () => {
      mockPickService.getPickedItems.mockReturnValue(of(pickedItemsFixture));
      const component = await setupConsumeItems('wo-001', null);

      expect(component.canConsume()).toBe(true);
    });
  });
});
