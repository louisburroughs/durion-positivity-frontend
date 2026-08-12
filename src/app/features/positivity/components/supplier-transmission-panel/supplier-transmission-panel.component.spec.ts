/**
 * Vendor transmission panel (issue #191).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 * ADR-0033: the load effect cancels in flight work via `onCleanup`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierTransmissionPanelComponent } from './supplier-transmission-panel.component';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import {
  SupplierManualReviewItem,
  SupplierOrderStatusHistory,
  SupplierOrderTransmission,
} from '../../models/supplier-order-transmission.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

const transmission: SupplierOrderTransmission = {
  purchaseOrderId: PO_ID,
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  state: 'PARTIALLY_CONFIRMED',
  vendorOrderNumber: 'MX-ORD-99182',
  vendorDocumentId: 'DOC-4411',
  lines: [
    {
      poLineId: 'line-1',
      sku: 'MX-2255',
      productName: 'Primacy 4 225/55R17',
      orderedQuantity: 8,
      confirmedQuantity: 8,
      outcome: 'ACCEPTED',
      vendorReason: null,
      expectedShipDate: '2026-08-14',
    },
    {
      poLineId: 'line-2',
      sku: 'MX-1955',
      productName: 'Primacy 4 195/55R16',
      orderedQuantity: 4,
      confirmedQuantity: 2,
      outcome: 'BACKORDERED',
      vendorReason: 'Rupture partielle — 2 pièces semaine 34',
      expectedShipDate: '2026-08-20',
    },
    {
      poLineId: 'line-3',
      sku: 'MX-2050',
      productName: 'Pilot Sport 205/50R17',
      orderedQuantity: 6,
      confirmedQuantity: 0,
      outcome: 'REJECTED',
      vendorReason: 'Article obsolète',
      expectedShipDate: null,
    },
    {
      poLineId: 'line-4',
      sku: 'MX-2456',
      productName: 'CrossClimate 245/60R18',
      orderedQuantity: 2,
      confirmedQuantity: null,
      outcome: 'PENDING',
      vendorReason: null,
      expectedShipDate: null,
    },
  ],
  resolutionActions: [],
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 120,
};

const manualReview: SupplierOrderTransmission = {
  ...transmission,
  state: 'MANUAL_REVIEW',
  vendorOrderNumber: null,
  manualReviewReason: 'No vendor acknowledgement within the agreed window.',
  resolutionActions: [{ action: 'CONFIRM_MATCHED' }, { action: 'MARK_REJECTED' }],
};

/** Deliberately out of order: the panel must sort a copy, oldest first. */
const history: SupplierOrderStatusHistory = {
  purchaseOrderId: PO_ID,
  events: [
    {
      statusEventId: 'ev-3',
      occurredAt: '2026-08-12T11:40:00Z',
      state: 'PARTIALLY_CONFIRMED',
      vendorStatus: 'PARTIAL',
      note: 'Two lines short',
    },
    {
      statusEventId: 'ev-1',
      occurredAt: '2026-08-12T09:00:00Z',
      state: 'SENT',
      vendorStatus: null,
      note: null,
    },
    {
      statusEventId: 'ev-2',
      occurredAt: '2026-08-12T10:00:00Z',
      state: null,
      vendorStatus: 'VENDOR_QUEUE_ACCEPTED',
      note: null,
    },
  ],
  fetchedAt: '2026-08-12T11:59:00Z',
};

const resolvedItem: SupplierManualReviewItem = {
  purchaseOrderId: PO_ID,
  poNumber: 'PO-1042',
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  vendorOrderNumber: 'MX-ORD-99182',
  state: 'CONFIRMED',
  reason: 'NO_VENDOR_ACK',
  detectedAt: '2026-08-12T10:15:00Z',
  resolutionActions: [],
  resolved: true,
};

describe('SupplierTransmissionPanelComponent', () => {
  let fixture: ComponentFixture<SupplierTransmissionPanelComponent>;

  const service = {
    getTransmission: vi.fn(),
    getStatusHistory: vi.fn(),
    listManualReview: vi.fn(),
    getManualReviewItem: vi.fn(),
    resolveManualReview: vi.fn(),
  };

  beforeEach(async () => {
    service.getTransmission.mockReturnValue(of(transmission));
    service.getStatusHistory.mockReturnValue(of(history));
    service.resolveManualReview.mockReturnValue(of(resolvedItem));

    await TestBed.configureTestingModule({
      imports: [SupplierTransmissionPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierOrderTransmissionService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierTransmissionPanelComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('purchaseOrderId', PO_ID);
    fixture.componentRef.setInput('poNumber', 'PO-1042');
    fixture.componentRef.setInput('nowMs', NOW);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('loads state and history for the order and renders the transmission state', () => {
    const el = render();

    expect(service.getTransmission).toHaveBeenCalledWith(PO_ID);
    expect(service.getStatusHistory).toHaveBeenCalledWith(PO_ID);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.TRANSMISSION.STATE.PARTIALLY_CONFIRMED',
    );
  });

  it('requests nothing until the host supplies a purchase-order id', () => {
    fixture.componentRef.setInput('purchaseOrderId', null);
    fixture.detectChanges();

    expect(service.getTransmission).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('shows the vendor order number as an attribute, not a link', () => {
    const el = render();

    const refs = Array.from(el.querySelectorAll('.transmission__ref')).map(n =>
      n.textContent?.trim(),
    );
    expect(refs).toContain('MX-ORD-99182');
    expect(refs).toContain('DOC-4411');
    expect(el.querySelector('a[href*="MX-ORD"]')).toBeNull();
    expect(el.querySelector('a[routerLink]')).toBeNull();
  });

  it('renders every partial confirmation outcome per line, exactly as delivered', () => {
    const el = render();

    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(4);

    const outcomes = rows.map(
      r => r.querySelector('.supplier-chip__label')?.textContent?.trim(),
    );
    expect(outcomes).toEqual([
      'POSITIVITY.TRANSMISSION.OUTCOME.ACCEPTED',
      'POSITIVITY.TRANSMISSION.OUTCOME.BACKORDERED',
      'POSITIVITY.TRANSMISSION.OUTCOME.REJECTED',
      'POSITIVITY.TRANSMISSION.OUTCOME.PENDING',
    ]);
  });

  it('shows vendor reason text verbatim — never normalised or re-labelled', () => {
    const el = render();

    const reasons = Array.from(el.querySelectorAll('.transmission__reason')).map(n =>
      n.textContent?.trim(),
    );
    expect(reasons).toContain('Rupture partielle — 2 pièces semaine 34');
    expect(reasons).toContain('Article obsolète');
  });

  it('distinguishes an unanswered line from a line confirmed at zero', () => {
    const el = render();
    const rows = Array.from(el.querySelectorAll('tbody tr'));

    // line-3 was explicitly rejected with 0 confirmed. Columns after the row
    // header: product, ordered, confirmed.
    expect(rows[2].querySelectorAll('td')[2].textContent?.trim()).toBe('0');
    // line-4 has no vendor answer yet — never rendered as 0.
    expect(rows[3].querySelector('.transmission__unanswered')?.textContent?.trim()).toBe(
      'POSITIVITY.TRANSMISSION.LINES.NOT_ANSWERED',
    );
  });

  it('renders the status history oldest-first without mutating the source array', () => {
    const before = history.events.map(e => e.statusEventId);
    render();

    expect(fixture.componentInstance.timelineEntries().map(e => e.id)).toEqual([
      'ev-1',
      'ev-2',
      'ev-3',
    ]);
    expect(history.events.map(e => e.statusEventId)).toEqual(before);
  });

  it('renders the timeline as a list of real time elements, with no mutation control', () => {
    const el = render();

    const items = el.querySelectorAll('ol.pos-timeline li');
    expect(items).toHaveLength(3);
    expect(el.querySelectorAll('ol.pos-timeline time')).toHaveLength(3);
    expect(el.querySelectorAll('ol.pos-timeline button')).toHaveLength(0);
  });

  it('computes staleness from the vendor asOf and keeps the fetch time distinct', () => {
    const el = render();

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n => n.textContent?.trim());
    expect(terms).toEqual(['POSITIVITY.TRANSMISSION.AS_OF', 'POSITIVITY.TRANSMISSION.FETCHED_AT']);
    // asOf is 20 minutes old against a 120-minute threshold — current.
    expect(el.querySelector('.staleness__chip .supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FRESHNESS.CURRENT',
    );
  });

  it('marks data stale from the vendor asOf even when the fetch was seconds ago', () => {
    service.getTransmission.mockReturnValue(
      of({ ...transmission, asOf: '2026-08-12T04:00:00Z', fetchedAt: '2026-08-12T11:59:59Z' }),
    );
    const el = render();

    expect(el.querySelector('.staleness__chip .supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FRESHNESS.STALE',
    );
  });

  it('offers no re-send, retry-transmission or re-transmit affordance anywhere', () => {
    service.getTransmission.mockReturnValue(of(manualReview));
    const el = render();

    const controls = Array.from(el.querySelectorAll('button, a, input[type="submit"]'));
    const text = controls.map(c => `${c.textContent ?? ''} ${c.className}`).join(' ').toLowerCase();

    expect(text).not.toMatch(/resend|re-send|retransmit|re-transmit|send.?again|transmit/);
    expect(el.querySelector('[data-action="resend"]')).toBeNull();
  });

  // Issue #191 scopes resolution to the administrator queue, which sits behind
  // ROLE_ADMIN routing. This panel's host route (po-detail) has no role guard,
  // so rendering a resolution control here would place an admin-scoped action
  // that risks a duplicate physical order on an unguarded route, with backend
  // gating as the only barrier. The panel reports state and routes the user.
  it('renders no resolution control for MANUAL_REVIEW, even when the backend offers actions', () => {
    service.getTransmission.mockReturnValue(of(manualReview));
    const el = render();

    expect(manualReview.resolutionActions.length).toBeGreaterThan(0);
    expect(el.querySelector('.review-actions')).toBeNull();
    expect(el.querySelector('app-supplier-manual-review-actions')).toBeNull();

    const controlText = Array.from(el.querySelectorAll('button, a, [role="button"]'))
      .map(c => c.textContent ?? '')
      .join(' ');
    expect(controlText).not.toMatch(/CONFIRM_MATCHED|MARK_REJECTED/);
  });

  it('never calls the resolution endpoint from this panel', () => {
    service.getTransmission.mockReturnValue(of(manualReview));
    const el = render();

    el.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.click());
    fixture.detectChanges();

    expect(service.resolveManualReview).not.toHaveBeenCalled();
  });

  it('routes the user to the administrator queue for MANUAL_REVIEW', () => {
    service.getTransmission.mockReturnValue(of(manualReview));
    const el = render();

    expect(el.querySelector('.transmission__review-routing')?.textContent?.trim()).toBe(
      'POSITIVITY.TRANSMISSION.MANUAL_REVIEW_ADMIN_ONLY',
    );
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.getTransmission.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders a 404 as "not transmitted electronically", not as a failure', () => {
    service.getTransmission.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(el.querySelector('.transmission__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.TRANSMISSION.NOT_TRANSMITTED',
    );
  });

  it('sets state then errorKey on a 5xx load failure and keeps retry available (ADR-0031)', () => {
    service.getStatusHistory.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('formats a vendor date-only ship date without shifting it a day (ADR-0038)', () => {
    render();

    expect(fixture.componentInstance.shipDateFor('2026-08-14')).toBe('2026-08-14T00:00:00');
    expect(fixture.componentInstance.shipDateFor(null)).toBeNull();
  });
});
