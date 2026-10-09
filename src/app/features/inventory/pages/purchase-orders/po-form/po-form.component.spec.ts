import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import enUS from '../../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../../core/services/auth.service';
import { SupplierVendorOption, SupplierVendorRoster } from '../../../../../shared/supplier-vendors/models/supplier-vendor-roster.models';
import { SupplierVendorRosterService } from '../../../../../shared/supplier-vendors/services/supplier-vendor-roster.service';
import { PoFormComponent } from './po-form.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PurchaseOrderDetail } from '../../../models/inventory.models';

const WRITE = 'order:purchase_order:create';
const VENDOR_READ = 'supplier:vendor:read';

const ACME: SupplierVendorOption = { vendorId: 'vendor-1', vendorNumber: 'V-000001', displayName: 'Acme Parts', active: true };
const BOLT: SupplierVendorOption = { vendorId: 'vendor-2', vendorNumber: 'V-000002', displayName: 'Bolt Supply', active: true };
const RETIRED: SupplierVendorOption = { vendorId: 'vendor-9', vendorNumber: 'V-000009', displayName: 'Retired Co', active: false };

const roster = (...vendors: SupplierVendorOption[]): SupplierVendorRoster => ({ vendors, truncated: false });

const draft = (overrides: Partial<PurchaseOrderDetail> = {}): PurchaseOrderDetail => ({
  poId: 'po-001',
  poNumber: 'PO-001',
  status: 'DRAFT',
  supplierId: ACME.vendorId,
  lineCount: 1,
  openBalance: 0,
  scheduledDeliveryDate: '2026-11-02',
  notes: 'Ring the bell',
  lines: [{ poLineId: 'l1', productSku: 'SKU-1', orderedQty: 2, receivedQty: 0, unitPrice: 4.5, status: 'OPEN' }],
  poDate: '2026-10-01',
  ...overrides,
});

const http = (status: number, body: unknown = null, headers: Record<string, string> = {}): HttpErrorResponse =>
  new HttpErrorResponse({ status, error: body, headers: new HttpHeaders(headers) });

class AuthStub {
  readonly claims = signal<{ sub?: string } | null>({ sub: 'buyer.a' });
  readonly tenant = signal<string | null>('tenant-1');
  readonly permissions = signal<ReadonlySet<string> | null>(new Set([WRITE, VENDOR_READ]));

  readonly currentUserClaims = () => this.claims();
  readonly tenantId = () => this.tenant();
  readonly permissionsKnown = () => this.permissions() !== null;
  readonly hasPermission = (code: string) => this.permissions()?.has(code) ?? false;
  readonly hasAnyPermission = (codes: readonly string[]) => codes.some(code => this.hasPermission(code));

  grant(...codes: string[]): void {
    this.permissions.set(new Set(codes));
  }
}

describe('PoFormComponent', () => {
  let fixture: ComponentFixture<PoFormComponent>;
  let component: PoFormComponent;
  let auth: AuthStub;
  let router: Router;
  const poService = {
    getPurchaseOrder: vi.fn<(poId: string) => Observable<PurchaseOrderDetail>>(),
    createPurchaseOrder: vi.fn<(request: unknown) => Observable<PurchaseOrderDetail>>(),
    revisePurchaseOrder: vi.fn<(poId: string, request: unknown) => Observable<PurchaseOrderDetail>>(),
  };
  const vendorRoster = {
    listActiveVendors: vi.fn<() => Observable<SupplierVendorRoster>>(),
    getVendor: vi.fn<(vendorId: string) => Observable<SupplierVendorOption>>(),
  };

  function setup(options: { poId?: string; auth?: AuthStub } = {}): void {
    auth = options.auth ?? new AuthStub();
    TestBed.configureTestingModule({
      imports: [PoFormComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: poService },
        { provide: SupplierVendorRosterService, useValue: vendorRoster },
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (key: string) => (key === 'poId' ? (options.poId ?? null) : null) } } },
        },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PoFormComponent);
    component = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    render();
  }

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const query = (testId: string): HTMLElement | null => el().querySelector(`[data-testid="${testId}"]`);
  const text = (testId: string): string => query(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const select = (): HTMLSelectElement | null => el().querySelector<HTMLSelectElement>('#po-vendor');
  const optionTexts = (): string[] => Array.from(select()?.options ?? []).map(option => option.textContent?.trim() ?? '');
  const submitButton = (): HTMLButtonElement => query('po-submit') as HTMLButtonElement;

  function choose(vendorId: string): void {
    const control = select();
    if (!control) throw new Error('no vendor picker');
    control.value = vendorId;
    control.dispatchEvent(new Event('change'));
    render();
  }

  function typeReason(value: string): void {
    const reason = el().querySelector<HTMLTextAreaElement>('#po-revision-reason');
    if (!reason) throw new Error('no reason field');
    reason.value = value;
    reason.dispatchEvent(new Event('input'));
    render();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vendorRoster.listActiveVendors.mockReturnValue(of(roster(ACME, BOLT)));
    vendorRoster.getVendor.mockImplementation(id =>
      id === RETIRED.vendorId ? of(RETIRED) : throwError(() => http(404, { code: 'SUPPLIER_VENDOR_NOT_FOUND' })),
    );
    poService.createPurchaseOrder.mockReturnValue(of(draft({ poId: 'po-new' })));
    poService.revisePurchaseOrder.mockReturnValue(of(draft()));
    poService.getPurchaseOrder.mockReturnValue(of(draft()));
  });

  afterEach(() => {
    fixture?.nativeElement.remove();
    TestBed.resetTestingModule();
  });

  // ── Create: the active-vendor picker ────────────────────────────────────────

  describe('create', () => {
    it('offers the ACTIVE vendors behind a "choose" placeholder instead of a free-text supplier', () => {
      setup();

      expect(el().querySelector('#po-supplier')).toBeNull();
      expect(el().querySelector('label[for="po-vendor"]')?.textContent?.trim()).toBe('Vendor');
      expect(optionTexts()).toEqual(['Choose a vendor', 'V-000001 — Acme Parts', 'V-000002 — Bolt Supply']);
      expect(select()?.required).toBe(true);
      expect(vendorRoster.getVendor).not.toHaveBeenCalled();
    });

    it('sends the chosen vendor as vendorId', () => {
      setup();
      choose(BOLT.vendorId);

      component.submit();

      expect(poService.createPurchaseOrder).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: BOLT.vendorId, lines: [] }),
      );
      expect(router.navigate).toHaveBeenCalledWith(['/app/inventory/purchase-orders', 'po-new']);
    });

    it('refuses to submit without a vendor and says so, linked to the picker', () => {
      setup();

      component.submit();
      render();

      expect(poService.createPurchaseOrder).not.toHaveBeenCalled();
      expect(text('po-vendor-error')).toBe('Choose a vendor.');
      expect(select()?.getAttribute('aria-invalid')).toBe('true');
      expect(select()?.getAttribute('aria-describedby')).toContain('po-vendor-error');
      expect(document.activeElement).toBe(select());
    });

    it('states the consequence before the button that commits it', () => {
      setup();

      const consequence = query('po-consequence') as HTMLElement;
      expect(text('po-consequence')).toBe(
        'The order is saved as a draft. Nothing is sent to the vendor until the order is approved and sent.',
      );
      expect(consequence.compareDocumentPosition(submitButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(submitButton().getAttribute('aria-describedby')).toContain('po-consequence');
    });

    it('without supplier:vendor:read: says why, and Submit is blocked but focusable with its reason linked', () => {
      const denied = new AuthStub();
      denied.grant(WRITE);
      setup({ auth: denied });

      expect(vendorRoster.listActiveVendors).not.toHaveBeenCalled();
      expect(select()).toBeNull();
      expect(text('po-vendor-status-message')).toBe(
        'You need permission to view vendors (supplier:vendor:read) to choose one for a new purchase order. Ask an administrator for vendor access.',
      );
      expect(submitButton().disabled).toBe(false);
      expect(submitButton().getAttribute('aria-disabled')).toBe('true');
      expect(submitButton().getAttribute('aria-describedby')).toContain('po-submit-blocked');
      expect(text('po-submit-blocked')).toBe('You can’t submit a new order without permission to view vendors.');
    });

    it('a vendor read revoked after choosing: submit() itself refuses', () => {
      setup();
      choose(ACME.vendorId);

      auth.grant(WRITE);
      render();
      component.submit();

      expect(poService.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('without order:purchase_order:create: Submit is blocked with the code, and submit() refuses after a revoke', () => {
      setup();
      choose(ACME.vendorId);

      auth.grant(VENDOR_READ);
      render();

      expect(text('po-submit-blocked')).toBe(
        'You need permission to create and change purchase orders (order:purchase_order:create).',
      );
      expect(submitButton().getAttribute('aria-disabled')).toBe('true');
      component.submit();
      expect(poService.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('an unknown perm_bits token falls back to the route gate and may submit', () => {
      const legacy = new AuthStub();
      legacy.permissions.set(null);
      setup({ auth: legacy });
      choose(ACME.vendorId);

      component.submit();

      expect(poService.createPurchaseOrder).toHaveBeenCalledTimes(1);
    });

    it('a failed vendor read blocks Submit and offers a retry that lands focus on the picker', () => {
      vendorRoster.listActiveVendors.mockReturnValueOnce(throwError(() => http(500)));
      setup();

      expect(text('po-vendor-load-error')).toContain('The vendor list couldn’t be loaded.');
      expect(text('po-submit-blocked')).toBe('Load the vendor list again before submitting.');

      (query('po-vendor-retry') as HTMLButtonElement).click();
      render();
      render();

      expect(vendorRoster.listActiveVendors).toHaveBeenCalledTimes(2);
      expect(select()).not.toBeNull();
      expect(document.activeElement).toBe(select());
      expect(query('po-submit-blocked')).toBeNull();
    });

    it('no active vendor at all: says so and blocks Submit', () => {
      vendorRoster.listActiveVendors.mockReturnValue(of(roster()));
      setup();

      expect(select()).toBeNull();
      expect(text('po-vendor-status-message')).toBe(
        'There are no active vendors to order from. A vendor must be added before a purchase order can be created.',
      );
      expect(text('po-submit-blocked')).toBe('There is no active vendor to place this order with.');
    });

    it('422 VENDOR_INACTIVE: says nothing was saved, marks the vendor, reads the list again and drops the stale choice', () => {
      setup();
      choose(BOLT.vendorId);
      poService.createPurchaseOrder.mockReturnValueOnce(throwError(() => http(422, { code: 'VENDOR_INACTIVE' })));
      vendorRoster.listActiveVendors.mockReturnValue(of(roster(ACME)));

      component.submit();
      render();

      expect(text('po-form-error')).toBe(
        'This vendor is inactive and takes no new purchase orders, so nothing was saved. Choose an active vendor.',
      );
      expect(vendorRoster.listActiveVendors).toHaveBeenCalledTimes(2);
      expect(optionTexts()).toEqual(['Choose a vendor', 'V-000001 — Acme Parts']);
      expect(component.vendorId()).toBe('');
      expect(text('po-vendor-error')).toBe('Choose an active vendor.');
      expect(select()?.getAttribute('aria-invalid')).toBe('true');
      expect(select()?.getAttribute('aria-describedby')).toContain('po-vendor-error');
      expect(document.activeElement).toBe(query('po-form-error'));
    });

    it('503 VENDOR_REPLICATION_PENDING: nothing was saved, try again after Retry-After; the choice is kept', () => {
      setup();
      choose(ACME.vendorId);
      poService.createPurchaseOrder.mockReturnValueOnce(
        throwError(() => http(503, { code: 'VENDOR_REPLICATION_PENDING' }, { 'Retry-After': '30' })),
      );

      component.submit();
      render();

      expect(text('po-form-error')).toBe(
        'This vendor hasn’t reached purchase orders yet, so nothing was saved. Try again in 30 seconds.',
      );
      expect(component.vendorId()).toBe(ACME.vendorId);
      expect(vendorRoster.listActiveVendors).toHaveBeenCalledTimes(1);
      expect(query('po-go-to-list')).toBeNull();
    });

    it('a timeout is an unknown outcome, distinct from a refusal, and points at the list', () => {
      setup();
      choose(ACME.vendorId);
      poService.createPurchaseOrder.mockReturnValueOnce(throwError(() => http(504)));

      component.submit();
      render();

      expect(text('po-form-error')).toContain(
        'We couldn’t confirm whether the order was created. Check the purchase orders list before submitting again, so the order isn’t created twice.',
      );
      expect(query('po-go-to-list')?.getAttribute('href')).toBe('/app/inventory/purchase-orders');
    });

    it('a 400 with no field named gets the unnamed copy and marks nothing', () => {
      setup();
      choose(ACME.vendorId);
      poService.createPurchaseOrder.mockReturnValueOnce(throwError(() => http(400, { code: 'VALIDATION_ERROR' })));

      component.submit();
      render();

      expect(text('po-form-error')).toBe(
        'The order wasn’t saved because some of its details weren’t accepted. Check the vendor, the delivery date, the notes and every line, then try again.',
      );
      expect(el().querySelector('[aria-invalid="true"]')).toBeNull();
    });

    it('a 400 naming the lines marks them, linked from the table', () => {
      setup();
      choose(ACME.vendorId);
      component.addLine();
      poService.createPurchaseOrder.mockReturnValueOnce(
        throwError(() => http(400, { code: 'VALIDATION_ERROR', fieldErrors: [{ field: 'lines[0].unitCostMinor' }] })),
      );

      component.submit();
      render();

      expect(text('po-form-error')).toBe('The order wasn’t saved. Check the highlighted fields.');
      expect(text('po-lines-error')).toBe(
        'Check the order lines: every line needs a SKU, a quantity above zero and a unit price above zero.',
      );
      expect(el().querySelector('table')?.getAttribute('aria-describedby')).toBe('po-lines-error');
    });

    it('one submit at a time', () => {
      setup();
      choose(ACME.vendorId);
      poService.createPurchaseOrder.mockReturnValueOnce(new Subject<PurchaseOrderDetail>());

      component.submit();
      component.submit();

      expect(poService.createPurchaseOrder).toHaveBeenCalledTimes(1);
    });

    it('a tid|sub change drops what was typed and the in-flight create (ADR-0063 §7)', () => {
      setup();
      choose(ACME.vendorId);
      component.addLine();
      component.notes.set('tenant one notes');
      const pending = new Subject<PurchaseOrderDetail>();
      poService.createPurchaseOrder.mockReturnValueOnce(pending);
      component.submit();

      auth.tenant.set('tenant-2');
      render();
      pending.next(draft({ poId: 'po-tenant-1' }));
      render();

      expect(component.vendorId()).toBe('');
      expect(component.lines()).toEqual([]);
      expect(component.notes()).toBe('');
      expect(component.submitting()).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(vendorRoster.listActiveVendors).toHaveBeenCalledTimes(2);
    });

    it('a vendor list read for the previous identity that lands late paints nothing', () => {
      const first = new Subject<SupplierVendorRoster>();
      vendorRoster.listActiveVendors.mockReturnValueOnce(first);
      setup();

      auth.claims.set({ sub: 'buyer.b' });
      render();
      first.next(roster(RETIRED));
      first.complete();
      render();

      expect(optionTexts()).toEqual(['Choose a vendor', 'V-000001 — Acme Parts', 'V-000002 — Bolt Supply']);
    });
  });

  // ── Edit: DRAFT-only vendor change ──────────────────────────────────────────

  describe('edit', () => {
    it('pre-selects a DRAFT order’s vendor and moves it with vendorId, naming the new vendor before Submit', () => {
      setup({ poId: 'po-001' });

      expect(select()?.value).toBe(ACME.vendorId);
      choose(BOLT.vendorId);
      expect(text('po-consequence')).toBe(
        'Saving replaces this order’s details and all of its lines, and records your reason. The order will be placed with V-000002 — Bolt Supply instead of its current vendor.',
      );
      typeReason('Acme is out of stock');

      component.submit();

      expect(poService.revisePurchaseOrder).toHaveBeenCalledWith(
        'po-001',
        expect.objectContaining({ vendorId: BOLT.vendorId, revisionReason: 'Acme is out of stock', current: draft() }),
      );
    });

    it('an unchanged vendor is not sent', () => {
      setup({ poId: 'po-001' });
      typeReason('Later delivery');

      component.submit();

      expect(poService.revisePurchaseOrder).toHaveBeenCalledWith('po-001', expect.objectContaining({ vendorId: undefined }));
    });

    it('needs a reason, linked to its field', () => {
      setup({ poId: 'po-001' });

      component.submit();
      render();

      expect(poService.revisePurchaseOrder).not.toHaveBeenCalled();
      const reason = el().querySelector('#po-revision-reason') as HTMLTextAreaElement;
      expect(text('po-revision-reason-error')).toBe('Enter a reason for this change.');
      expect(reason.getAttribute('aria-invalid')).toBe('true');
      expect(reason.getAttribute('aria-describedby')).toBe('po-revision-reason-error');
      expect(document.activeElement).toBe(reason);
    });

    it('past DRAFT the vendor is read-only and named, never a picker', () => {
      poService.getPurchaseOrder.mockReturnValue(of(draft({ status: 'APPROVED' })));
      setup({ poId: 'po-001' });

      expect(select()).toBeNull();
      expect(text('po-vendor-current')).toBe('V-000001 — Acme Parts');
      expect(text('po-vendor-locked')).toBe('The vendor can’t be changed because this order is no longer a draft.');
    });

    it('a DRAFT order with an inactive vendor is prompted to change it', () => {
      poService.getPurchaseOrder.mockReturnValue(of(draft({ supplierId: RETIRED.vendorId })));
      setup({ poId: 'po-001' });

      expect(vendorRoster.getVendor).toHaveBeenCalledWith(RETIRED.vendorId);
      expect(optionTexts()).toEqual(['V-000009 — Retired Co (inactive)', 'V-000001 — Acme Parts', 'V-000002 — Bolt Supply']);
      expect(select()?.value).toBe(RETIRED.vendorId);
      expect(text('po-vendor-prompt')).toBe(
        'This order’s vendor is inactive, so the order can’t be approved or sent. Choose an active vendor and save the order.',
      );
      expect(select()?.getAttribute('aria-describedby')).toContain('po-vendor-prompt');

      choose(ACME.vendorId);
      expect(query('po-vendor-prompt')).toBeNull();
    });

    it('a requested order whose vendor is not in the vendor master is prompted, never showing the raw id', () => {
      poService.getPurchaseOrder.mockReturnValue(of(draft({ supplierId: 'feed-7781' })));
      setup({ poId: 'po-001' });

      expect(optionTexts()[0]).toBe('Current vendor (not in the vendor list)');
      expect(el().textContent).not.toContain('feed-7781');
      expect(text('po-vendor-prompt')).toBe(
        'This order’s vendor isn’t in the vendor list, so the order can’t be approved or sent. Choose an active vendor and save the order.',
      );
    });

    it('a vendor change only to a listed ACTIVE vendor: submit() refuses anything else', () => {
      setup({ poId: 'po-001' });
      typeReason('Switch');
      component.vendorId.set('vendor-not-listed');

      component.submit();

      expect(poService.revisePurchaseOrder).not.toHaveBeenCalled();
    });

    it('409 past DRAFT: says so, locks the vendor back to the order’s own and reads the order again', () => {
      setup({ poId: 'po-001' });
      choose(BOLT.vendorId);
      typeReason('Switch vendor');
      poService.revisePurchaseOrder.mockReturnValueOnce(throwError(() => http(409, { code: 'PURCHASE_ORDER_INVALID_STATE' })));
      poService.getPurchaseOrder.mockReturnValueOnce(of(draft({ status: 'APPROVED' })));

      component.submit();
      render();

      expect(text('po-form-error')).toBe(
        'This order is no longer a draft, so its vendor can’t be changed. Nothing was saved. Save again to keep your other changes with its current vendor.',
      );
      expect(poService.getPurchaseOrder).toHaveBeenCalledTimes(2);
      expect(select()).toBeNull();
      expect(component.vendorId()).toBe(ACME.vendorId);
      expect(component.revisionReason()).toBe('Switch vendor');
      expect(document.activeElement).toBe(query('po-form-error'));
    });

    it('a 409 locks the vendor even when the re-read fails', () => {
      setup({ poId: 'po-001' });
      choose(BOLT.vendorId);
      typeReason('Switch vendor');
      poService.revisePurchaseOrder.mockReturnValueOnce(throwError(() => http(409, { code: 'PURCHASE_ORDER_INVALID_STATE' })));
      poService.getPurchaseOrder.mockReturnValueOnce(throwError(() => http(500)));

      component.submit();
      render();

      expect(select()).toBeNull();
      expect(component.vendorId()).toBe(ACME.vendorId);
      expect(query('po-form-error')).not.toBeNull();
    });

    it('a revision that timed out offers to read the order again', () => {
      setup({ poId: 'po-001' });
      typeReason('Later delivery');
      poService.revisePurchaseOrder.mockReturnValueOnce(throwError(() => http(504)));

      component.submit();
      render();

      expect(text('po-form-error')).toContain(
        'We couldn’t confirm whether your changes were saved. Read the order again to check before saving again.',
      );
      (query('po-read-again') as HTMLButtonElement).click();
      render();
      expect(poService.getPurchaseOrder).toHaveBeenCalledTimes(2);
      expect(component.revisionReason()).toBe('');
    });

    it('a tid|sub change reads the order again and drops the typed reason', () => {
      setup({ poId: 'po-001' });
      typeReason('From the previous identity');

      auth.tenant.set('tenant-2');
      render();

      expect(poService.getPurchaseOrder).toHaveBeenCalledTimes(2);
      expect(component.revisionReason()).toBe('');
    });

    it('an order read for the previous identity that lands late paints nothing', () => {
      const first = new Subject<PurchaseOrderDetail>();
      poService.getPurchaseOrder.mockReturnValueOnce(first).mockReturnValueOnce(of(draft({ notes: 'tenant two' })));
      setup({ poId: 'po-001' });

      auth.tenant.set('tenant-2');
      render();
      first.next(draft({ notes: 'tenant one' }));
      render();

      expect(component.notes()).toBe('tenant two');
    });

    it('sets error state before errorKey when the order cannot be read', () => {
      poService.getPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
      setup({ poId: 'po-001' });

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.PURCHASE_ORDERS.FORM.ERROR.LOAD');
      expect(query('po-form-load-error')?.querySelector('p')?.textContent?.trim()).toBe('Failed to load purchase order for editing.');
    });
  });

  // ── Lines (#212) ────────────────────────────────────────────────────────────

  describe('lines', () => {
    beforeEach(() => setup());

    it('sets error state before errorKey on create failure', () => {
      choose(ACME.vendorId);
      poService.createPurchaseOrder.mockReturnValueOnce(throwError(() => http(422, { code: 'VENDOR_INACTIVE' })));
      const calls: string[] = [];
      const origState = component.state.set.bind(component.state);
      const origError = component.errorKey.set.bind(component.errorKey);
      vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
      vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

      component.submit();

      const errIdx = calls.findIndex(c => c.startsWith('state:error'));
      const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
      expect(errIdx).toBeGreaterThanOrEqual(0);
      expect(keyIdx).toBeGreaterThan(errIdx);
    });

    it('updateLine — ignores NaN for orderedQty and keeps existing value', () => {
      component.addLine();
      component.updateLine(0, 'orderedQty', Number.NaN);
      expect(component.lines()[0].orderedQty).toBe(1);
    });

    it('updateLine — ignores negative for unitPrice and keeps existing value', () => {
      component.addLine();
      component.updateLine(0, 'unitPrice', -50);
      expect(component.lines()[0].unitPrice).toBe(0);
    });

    it('toggleAvailabilityCheck() expands and collapses the panel for a line index', () => {
      component.toggleAvailabilityCheck(0);
      expect(component.availabilityCheckLineIndex()).toBe(0);
      component.toggleAvailabilityCheck(0);
      expect(component.availabilityCheckLineIndex()).toBeNull();
    });

    it('removeLine() collapses the availability panel when its line is removed', () => {
      component.addLine();
      component.toggleAvailabilityCheck(0);
      component.removeLine(0);
      expect(component.availabilityCheckLineIndex()).toBeNull();
    });

    it('removeLine() decrements the open panel index when a line before it is removed', () => {
      component.addLine();
      component.addLine();
      component.addLine();
      component.toggleAvailabilityCheck(2);
      component.removeLine(0);
      expect(component.availabilityCheckLineIndex()).toBe(1);
    });

    it('removeLine() leaves the open panel index unchanged when a line after it is removed', () => {
      component.addLine();
      component.addLine();
      component.addLine();
      component.toggleAvailabilityCheck(0);
      component.removeLine(2);
      expect(component.availabilityCheckLineIndex()).toBe(0);
    });
  });
});
