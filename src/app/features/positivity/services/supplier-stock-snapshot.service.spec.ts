/**
 * SupplierStockSnapshotService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierStockSnapshotService } from './supplier-stock-snapshot.service';
import { SupplierStockSnapshot } from '../models/supplier-stock-snapshot.models';

const BASE = environment.apiBaseUrl;
const VENDOR_ID = 'ffc9a4c2-0000-7000-8000-0000000000v1';
const URL = `${BASE}/supplier/v1/vendor-profiles/${VENDOR_ID}/stock-snapshots/latest`;

const snapshotFixture: SupplierStockSnapshot = {
  snapshotId: 'snap-1',
  vendorProfileId: VENDOR_ID,
  vendorDisplayName: 'Michelin EU',
  scope: { type: 'COUNTRY', code: 'FR', label: 'France' },
  asOf: '2026-08-12T06:00:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 720,
  lines: [
    {
      productId: null,
      sku: 'MX-2255',
      productName: 'Primacy 4 225/55R17',
      ean: '3528702345678',
      quantity: 120,
      unitOfMeasure: 'EA',
      warehouseName: 'Lyon DC',
    },
    {
      productId: null,
      sku: 'MX-1955',
      productName: 'Primacy 4 195/55R16',
      ean: null,
      quantity: 0,
      unitOfMeasure: 'EA',
      warehouseName: 'Lyon DC',
    },
    {
      productId: null,
      sku: 'MX-2050',
      productName: 'Pilot Sport 205/50R17',
      ean: null,
      quantity: null,
      unitOfMeasure: null,
      warehouseName: null,
    },
  ],
  totalLineCount: 3,
};

describe('SupplierStockSnapshotService', () => {
  let service: SupplierStockSnapshotService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierStockSnapshotService, ApiBaseService],
    });
    service = TestBed.inject(SupplierStockSnapshotService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getLatestSnapshot() — GET the vendor latest-snapshot path with no params by default', () => {
    service.getLatestSnapshot(VENDOR_ID).subscribe();

    const req = http.expectOne(r => r.url === URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush(snapshotFixture);
  });

  it('getLatestSnapshot() — forwards scope and search filters', () => {
    service.getLatestSnapshot(VENDOR_ID, { scopeCode: 'FR', search: 'MX-22' }).subscribe();

    const req = http.expectOne(r => r.url === URL);
    expect(req.request.params.get('scopeCode')).toBe('FR');
    expect(req.request.params.get('search')).toBe('MX-22');
    req.flush(snapshotFixture);
  });

  it('keeps an unreported quantity null and an explicit zero at zero', () => {
    let received: SupplierStockSnapshot | undefined;
    service.getLatestSnapshot(VENDOR_ID).subscribe(v => (received = v));
    http.expectOne(r => r.url === URL).flush(snapshotFixture);

    const explicitZero = received?.lines.find(l => l.sku === 'MX-1955');
    const notReported = received?.lines.find(l => l.sku === 'MX-2050');

    expect(explicitZero?.quantity).toBe(0);
    expect(notReported?.quantity).toBeNull();
    expect(notReported?.unitOfMeasure).toBeNull();
  });

  it('preserves the vendor asOf separately from the platform fetch time', () => {
    let received: SupplierStockSnapshot | undefined;
    service.getLatestSnapshot(VENDOR_ID).subscribe(v => (received = v));
    http.expectOne(r => r.url === URL).flush(snapshotFixture);

    expect(received?.asOf).toBe('2026-08-12T06:00:00Z');
    expect(received?.fetchedAt).toBe('2026-08-12T12:00:00Z');
    expect(received?.stalenessThresholdMinutes).toBe(720);
  });

  it('propagates a 403 rather than presenting an empty snapshot', () => {
    let status = 0;
    service.getLatestSnapshot(VENDOR_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http.expectOne(r => r.url === URL).flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
  });

  it('exposes no mutating operation and nothing that could merge owned stock', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(
      methodNames.some(name => /create|update|delete|merge|combine|onhand|total/i.test(name)),
    ).toBe(false);
  });
});
