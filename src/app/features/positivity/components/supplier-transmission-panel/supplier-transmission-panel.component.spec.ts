/**
 * SupplierTransmissionPanelComponent tests (#191, #201).
 *
 * The service is mocked at the adapter boundary: the panel's contract is one
 * list read per purchase order, and the adapter has its own suite.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { WritableSignal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierTransmissionPanelComponent } from './supplier-transmission-panel.component';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import { SupplierOrderTransmission } from '../../models/supplier-order-transmission.models';

const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

const confirmed: SupplierOrderTransmission = {
  transmissionIntentId: 'ti-1',
  purchaseOrderId: PO_ID,
  purchaseOrderNumber: 'PO-1042',
  supplierRef: 'michelin-eu',
  state: 'CONFIRMED',
  supplierOrderNumber: 'MX-ORD-99182',
  documentId: 'DOC-4411',
  latestScheduledDeliveryDate: '2026-08-20',
  vendorReason: null,
  vendorErrorCode: null,
  failureDetail: null,
  lastStatusAt: '2026-08-12T11:40:00Z',
  lastTransitionAt: '2026-08-12T11:41:00Z',
  dispatchAttempts: 1,
  resolutionAction: null,
  resolvedAt: null,
  resolvedBy: null,
};

const manualReview: SupplierOrderTransmission = {
  ...confirmed,
  transmissionIntentId: 'ti-2',
  state: 'MANUAL_REVIEW',
  supplierOrderNumber: null,
  vendorReason: 'Rupture partielle — 2 pièces semaine 34',
  vendorErrorCode: 'PARTIAL_STOCK',
  lastStatusAt: '2026-08-12T12:10:00Z',
  dispatchAttempts: 3,
};

describe('SupplierTransmissionPanelComponent', () => {
  let fixture: ComponentFixture<SupplierTransmissionPanelComponent>;
  let component: SupplierTransmissionPanelComponent;
  let service: { listForPurchaseOrder: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { listForPurchaseOrder: vi.fn().mockReturnValue(of([confirmed])) };
    await TestBed.configureTestingModule({
      imports: [SupplierTransmissionPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierOrderTransmissionService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierTransmissionPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  function render(purchaseOrderId: string | null = PO_ID): HTMLElement {
    fixture.componentRef.setInput('purchaseOrderId', purchaseOrderId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('requests nothing until the host supplies a purchase-order id', () => {
    render(null);

    expect(service.listForPurchaseOrder).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });

  it('reads the transmissions once for the order and renders the current state', () => {
    const el = render();

    expect(service.listForPurchaseOrder).toHaveBeenCalledTimes(1);
    expect(service.listForPurchaseOrder).toHaveBeenCalledWith(PO_ID);
    expect(component.state()).toBe('ready');
    expect(el.textContent).toContain('POSITIVITY.TRANSMISSION.STATE.CONFIRMED');
    expect(el.querySelectorAll('.transmission__item')).toHaveLength(1);
  });

  it('shows the vendor order number as an attribute, not a link', () => {
    const el = render();
    const ref = el.querySelector('.transmission__ref');

    expect(ref?.tagName).toBe('CODE');
    expect(ref?.textContent).toBe('MX-ORD-99182');
    expect(el.querySelector('a[href*="MX-ORD-99182"]')).toBeNull();
  });

  it('renders the last status time as a real time element', () => {
    const el = render();
    const time = el.querySelector('.transmission__last-status time');

    expect(time?.getAttribute('datetime')).toBe('2026-08-12T11:40:00Z');
  });

  it('renders every transmission the backend returns, keyed by intent id', () => {
    service.listForPurchaseOrder.mockReturnValue(of([confirmed, manualReview]));
    const el = render();

    expect(el.querySelectorAll('.transmission__item')).toHaveLength(2);
    expect(el.textContent).toContain('POSITIVITY.TRANSMISSION.STATE.MANUAL_REVIEW');
  });

  it('summarises the most recently updated transmission in the header chip', () => {
    service.listForPurchaseOrder.mockReturnValue(of([confirmed, manualReview]));
    render();

    expect(component.latest()?.transmissionIntentId).toBe('ti-2');
  });

  it('picks the timestamped transmission as latest when others have no lastStatusAt', () => {
    const untimed1: SupplierOrderTransmission = { ...confirmed, transmissionIntentId: 'ti-a', lastStatusAt: null };
    const untimed2: SupplierOrderTransmission = { ...confirmed, transmissionIntentId: 'ti-b', lastStatusAt: null };
    const timed: SupplierOrderTransmission = {
      ...confirmed,
      transmissionIntentId: 'ti-c',
      lastStatusAt: '2026-08-01T00:00:00Z',
    };
    service.listForPurchaseOrder.mockReturnValue(of([untimed1, untimed2, timed]));
    render();

    expect(component.latest()?.transmissionIntentId).toBe('ti-c');
  });

  it('falls back to the first transmission in backend order when none has lastStatusAt', () => {
    const rows: SupplierOrderTransmission[] = [
      { ...confirmed, transmissionIntentId: 'ti-first', lastStatusAt: null },
      { ...manualReview, transmissionIntentId: 'ti-second', lastStatusAt: null },
      { ...confirmed, transmissionIntentId: 'ti-third', lastStatusAt: null },
    ];
    service.listForPurchaseOrder.mockReturnValue(of(rows));
    render();

    expect(component.latest()?.transmissionIntentId).toBe('ti-first');
  });

  it('renders every row even when transmissionIntentId is empty (index track fallback)', () => {
    const rows: SupplierOrderTransmission[] = [
      { ...confirmed, transmissionIntentId: '' },
      { ...manualReview, transmissionIntentId: '' },
    ];
    service.listForPurchaseOrder.mockReturnValue(of(rows));
    const el = render();

    expect(component.state()).toBe('ready');
    expect(el.querySelectorAll('.transmission__item')).toHaveLength(2);
  });

  it('shows vendor reason and error code verbatim — never normalised or re-labelled', () => {
    service.listForPurchaseOrder.mockReturnValue(of([manualReview]));
    const el = render();

    expect(el.querySelector('.transmission__reason')?.textContent?.trim()).toBe(
      'Rupture partielle — 2 pièces semaine 34',
    );
    expect(el.textContent).toContain('PARTIAL_STOCK');
  });

  it('treats an empty list as "not transmitted", not as an error', () => {
    service.listForPurchaseOrder.mockReturnValue(of([]));
    const el = render();

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
    expect(el.textContent).toContain('POSITIVITY.TRANSMISSION.NOT_TRANSMITTED');
  });

  it('treats a 404 as "not transmitted", not as an error', () => {
    service.listForPurchaseOrder.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    render();

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.listForPurchaseOrder.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(component.state()).toBe('forbidden');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('POSITIVITY.ERROR.FORBIDDEN');
  });

  it('sets state to error before errorKey on a vendor outage (ADR-0031)', () => {
    const load$ = new Subject<SupplierOrderTransmission[]>();
    service.listForPurchaseOrder.mockReturnValue(load$.asObservable());
    render();

    const stateSignal = component.state as WritableSignal<string>;
    const errorKeySignal = component.errorKey as WritableSignal<string | null>;
    const calls: string[] = [];
    const originalState = stateSignal.set.bind(stateSignal);
    const originalErrorKey = errorKeySignal.set.bind(errorKeySignal);
    vi.spyOn(stateSignal, 'set').mockImplementation(value => {
      calls.push(`state:${value}`);
      originalState(value);
    });
    vi.spyOn(errorKeySignal, 'set').mockImplementation(value => {
      calls.push(`key:${value}`);
      originalErrorKey(value);
    });

    load$.error(new HttpErrorResponse({ status: 500, statusText: 'Server Error' }));

    const stateIdx = calls.indexOf('state:error');
    const keyIdx = calls.findIndex(c => c.startsWith('key:') && !c.endsWith('null'));
    expect(stateIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(stateIdx);
    expect(component.errorKey()).not.toBeNull();
  });

  it('offers no re-send, retry-transmission or re-transmit affordance anywhere', () => {
    service.listForPurchaseOrder.mockReturnValue(of([confirmed, manualReview]));
    const el = render();

    const controlText = Array.from(el.querySelectorAll('button, a, input[type="submit"]'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/resend|re-send|retransmit|re-transmit|send.?again|transmit/);
    expect(el.textContent).toContain('POSITIVITY.TRANSMISSION.NO_RESEND_NOTE');
  });

  it('renders no resolution control for MANUAL_REVIEW', () => {
    service.listForPurchaseOrder.mockReturnValue(of([manualReview]));
    const el = render();

    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(el.querySelector('app-supplier-manual-review-actions')).toBeNull();
  });

  it('reload() re-reads the transmissions', () => {
    render();
    component.reload();
    fixture.detectChanges();

    expect(service.listForPurchaseOrder).toHaveBeenCalledTimes(2);
  });
});
