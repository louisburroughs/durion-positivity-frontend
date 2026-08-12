/**
 * SupplierFleetService contract tests (issue #194).
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierFleetService } from './supplier-fleet.service';
import {
  SupplierFleetAuthorization,
  SupplierFleetVehicleLookup,
} from '../models/supplier-fleet.models';

const BASE = environment.apiBaseUrl;
const LOOKUP_URL = `${BASE}/supplier/v1/fleet/vehicle-lookup`;
const WORKORDER_ID = 'cc33dd44-0000-7000-8000-000000000001';
const AUTH_URL = `${BASE}/supplier/v1/fleet/workorders/${WORKORDER_ID}/authorization`;

const foundFixture: SupplierFleetVehicleLookup = {
  outcome: 'FOUND',
  vehicleIdentifier: 'VF1RFA00567123456',
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  vehicle: {
    vehicleIdentifier: 'VF1RFA00567123456',
    vin: 'VF1RFA00567123456',
    plate: 'AB-123-CD',
    description: 'Renault Master 2.3 dCi — fleet unit 4471',
  },
  contracts: [
    {
      contractId: 'ct-1',
      contractNumber: 'MFS-2026-0044',
      fleetManagerName: 'Michelin Fleet Services',
      status: 'ACTIVE',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      policies: [
        {
          policyId: 'pol-1',
          description: 'Tyres and alignment, all axles',
          coverageNote: 'Excludes cosmetic wheel refinishing.',
        },
      ],
    },
  ],
  notFoundReason: null,
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 60,
};

const notFoundFixture: SupplierFleetVehicleLookup = {
  outcome: 'NOT_FOUND',
  vehicleIdentifier: 'UNKNOWN-PLATE-9',
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  vehicle: null,
  contracts: [],
  notFoundReason: 'No vehicle registered under this identifier.',
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 60,
};

const authorizationFixture: SupplierFleetAuthorization = {
  workorderId: WORKORDER_ID,
  state: 'GRANTED',
  authorizationReference: 'AUTH-88421',
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  contract: {
    contractId: 'ct-1',
    contractNumber: 'MFS-2026-0044',
    fleetManagerName: 'Michelin Fleet Services',
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    policies: [],
  },
  vendorReason: null,
  authorizedAmount: '840.00',
  currency: 'EUR',
  requestedAt: '2026-08-12T09:00:00Z',
  decidedAt: '2026-08-12T09:04:00Z',
  completionApproval: null,
  asOf: '2026-08-12T09:04:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 60,
};

const pendingFixture: SupplierFleetAuthorization = {
  ...authorizationFixture,
  state: 'PENDING',
  authorizationReference: null,
  decidedAt: null,
  authorizedAmount: null,
  currency: null,
};

describe('SupplierFleetService', () => {
  let service: SupplierFleetService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierFleetService, ApiBaseService],
    });
    service = TestBed.inject(SupplierFleetService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lookupVehicle() — GET /supplier/v1/fleet/vehicle-lookup with the identifier as a query param', () => {
    let received: SupplierFleetVehicleLookup | undefined;
    service.lookupVehicle('VF1RFA00567123456').subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === LOOKUP_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('vehicleIdentifier')).toBe('VF1RFA00567123456');
    expect(req.request.params.has('vendorProfileId')).toBe(false);
    req.flush(foundFixture);

    expect(received?.outcome).toBe('FOUND');
    expect(received?.contracts).toHaveLength(1);
  });

  it('lookupVehicle() — forwards an explicit vendor profile when the caller supplies one', () => {
    service.lookupVehicle('AB-123-CD', 'vp-fleet-1').subscribe();

    const req = http.expectOne(r => r.url === LOOKUP_URL);
    expect(req.request.params.get('vehicleIdentifier')).toBe('AB-123-CD');
    expect(req.request.params.get('vendorProfileId')).toBe('vp-fleet-1');
    req.flush(foundFixture);
  });

  it('lookupVehicle() — keeps a plate with slashes intact instead of splitting the path', () => {
    service.lookupVehicle('FLEET/4471').subscribe();

    const req = http.expectOne(r => r.url === LOOKUP_URL);
    expect(req.request.params.get('vehicleIdentifier')).toBe('FLEET/4471');
    req.flush(notFoundFixture);
  });

  it('lookupVehicle() — returns NOT_FOUND as a value, never as an error', () => {
    let received: SupplierFleetVehicleLookup | undefined;
    let errored = false;
    service.lookupVehicle('UNKNOWN-PLATE-9').subscribe({
      next: v => (received = v),
      error: () => (errored = true),
    });

    http.expectOne(r => r.url === LOOKUP_URL).flush(notFoundFixture);

    expect(errored).toBe(false);
    expect(received?.outcome).toBe('NOT_FOUND');
    expect(received?.notFoundReason).toBe('No vehicle registered under this identifier.');
  });

  it('getWorkorderAuthorization() — GET the workorder authorization by platform UUID', () => {
    let received: SupplierFleetAuthorization | undefined;
    service.getWorkorderAuthorization(WORKORDER_ID).subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === AUTH_URL);
    expect(req.request.method).toBe('GET');
    req.flush(authorizationFixture);

    expect(received?.state).toBe('GRANTED');
    expect(received?.authorizationReference).toBe('AUTH-88421');
  });

  it('getWorkorderAuthorization() — surfaces a 202-backed PENDING from the body', () => {
    let received: SupplierFleetAuthorization | undefined;
    service.getWorkorderAuthorization(WORKORDER_ID).subscribe(v => (received = v));

    http
      .expectOne(r => r.url === AUTH_URL)
      .flush(pendingFixture, { status: 202, statusText: 'Accepted' });

    expect(received?.state).toBe('PENDING');
    expect(received?.decidedAt).toBeNull();
  });

  it('getWorkorderAuthorization() — propagates a 404 so the caller can say "not a fleet workorder"', () => {
    let status = 0;
    service.getWorkorderAuthorization(WORKORDER_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === AUTH_URL)
      .flush({ message: 'not fleet' }, { status: 404, statusText: 'Not Found' });

    expect(status).toBe(404);
  });

  it('propagates a 403 rather than masking it as an absent authorization', () => {
    let status = 0;
    service.getWorkorderAuthorization(WORKORDER_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === AUTH_URL)
      .flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
  });

  it('passes an authorized amount through as delivered decimal text', () => {
    let received: SupplierFleetAuthorization | undefined;
    service.getWorkorderAuthorization(WORKORDER_ID).subscribe(v => (received = v));
    http.expectOne(r => r.url === AUTH_URL).flush(authorizationFixture);

    expect(received?.authorizedAmount).toBe('840.00');
    expect(typeof received?.authorizedAmount).toBe('string');
    expect(received?.currency).toBe('EUR');
  });

  // #194 §6 — "No frontend path mutates authorization state." Asserted rather
  // than merely intended: a client that could write this could tell an advisor
  // work is covered when nobody has agreed to cover it.
  it('exposes no operation that requests, grants, denies or advances authorization', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      name => name !== 'constructor',
    );

    expect(
      methodNames.filter(name =>
        /create|update|delete|remove|post|put|patch|save|submit|request|authorize|authorise|grant|deny|decline|approve|reject|override|escalate|cancel|retry|resend/i.test(
          name,
        ),
      ),
    ).toEqual([]);
    expect(methodNames.every(name => /^(get|list|lookup)/.test(name))).toBe(true);
  });

  it('issues only GET requests across its whole surface', () => {
    service.lookupVehicle('VF1RFA00567123456').subscribe();
    service.getWorkorderAuthorization(WORKORDER_ID).subscribe();

    const requests = [
      ...http.match(r => r.url === LOOKUP_URL),
      ...http.match(r => r.url === AUTH_URL),
    ];
    expect(requests).toHaveLength(2);
    expect(requests.every(r => r.request.method === 'GET')).toBe(true);
    requests[0].flush(foundFixture);
    requests[1].flush(authorizationFixture);
  });
});
