/**
 * SupplierFleetService — generated-client adapter tests (#194, #201).
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FleetAuthorizationResponse,
  FleetVehicle,
  SupplierFleetAuthorizationService as SupplierFleetAuthorizationApi,
} from '@durion-sdk/supplier';
import { SupplierFleetService } from './supplier-fleet.service';
import {
  SupplierFleetAuthorization,
  SupplierFleetVehicleLookup,
} from '../models/supplier-fleet.models';

const SUPPLIER_REF = 'michelin-fleet';
const WORKORDER_ID = 'cc33dd44-0000-7000-8000-000000000001';

const vehicleDto: FleetVehicle = {
  brand: 'Renault',
  fleetNumber: '4471',
  identifiable: true,
  licensePlate: 'AB-123-CD',
  model: 'Master 2.3 dCi',
  modelYear: 2024,
  odometerValue: '81234',
  vendorVehicleId: 'MFS-V-9981',
  vin: 'VF1RFA00567123456',
};

const authorizationDto: FleetAuthorizationResponse = {
  approvalStatus: 'MANUAL_REVIEW',
  authorizedAmount: 840,
  contractReference: 'MFS-2026-0044',
  currency: 'EUR',
  decidedAt: '2026-08-12T09:04:00Z',
  reasonCode: undefined,
  reasonText: undefined,
  requestedAt: '2026-08-12T09:00:00Z',
  reviewReason: 'Approval endpoint rejected the completion payload three times.',
  status: 'GRANTED',
  supplierRef: SUPPLIER_REF,
  vendorAuthorizationId: 'AUTH-88421',
  workorderId: WORKORDER_ID,
};

describe('SupplierFleetService', () => {
  let service: SupplierFleetService;
  let api: {
    lookupFleetVehicle: ReturnType<typeof vi.fn>;
    getFleetWorkorderAuthorization: ReturnType<typeof vi.fn>;
    requestFleetWorkorderAuthorization: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      lookupFleetVehicle: vi.fn().mockReturnValue(of(vehicleDto)),
      getFleetWorkorderAuthorization: vi.fn().mockReturnValue(of(authorizationDto)),
      requestFleetWorkorderAuthorization: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [SupplierFleetService, { provide: SupplierFleetAuthorizationApi, useValue: api }],
    });
    service = TestBed.inject(SupplierFleetService);
  });

  it('lookupVehicle() — calls the generated read with supplierRef first, then the identifier', () => {
    service.lookupVehicle('supplier-a', 'VIN-1').subscribe();

    expect(api.lookupFleetVehicle).toHaveBeenCalledTimes(1);
    expect(api.lookupFleetVehicle).toHaveBeenCalledWith('supplier-a', 'VIN-1');
  });

  it('lookupVehicle() — maps FleetVehicle field by field into a FOUND lookup', () => {
    let result: SupplierFleetVehicleLookup | undefined;
    service.lookupVehicle(SUPPLIER_REF, 'VF1RFA00567123456').subscribe(value => (result = value));

    expect(result).toEqual({
      outcome: 'FOUND',
      supplierRef: SUPPLIER_REF,
      vehicleIdentifier: 'VF1RFA00567123456',
      vehicle: {
        vin: 'VF1RFA00567123456',
        plate: 'AB-123-CD',
        brand: 'Renault',
        model: 'Master 2.3 dCi',
        modelYear: 2024,
        fleetNumber: '4471',
        vendorVehicleId: 'MFS-V-9981',
        odometer: '81234',
        identifiable: true,
      },
    });
  });

  it('lookupVehicle() — an unidentifiable vehicle is a NOT_FOUND answer on a 200, never an error', () => {
    api.lookupFleetVehicle.mockReturnValue(of({ identifiable: false } as FleetVehicle));
    let result: SupplierFleetVehicleLookup | undefined;
    const error = vi.fn();
    service.lookupVehicle(SUPPLIER_REF, 'UNKNOWN-9').subscribe({ next: value => (result = value), error });

    expect(error).not.toHaveBeenCalled();
    expect(result?.outcome).toBe('NOT_FOUND');
    expect(result?.vehicle).toBeNull();
    expect(result?.vehicleIdentifier).toBe('UNKNOWN-9');
  });

  it('getWorkorderAuthorization() — calls the generated read with supplierRef first, then the workorder', () => {
    service.getWorkorderAuthorization('supplier-a', 'wo-1').subscribe();

    expect(api.getFleetWorkorderAuthorization).toHaveBeenCalledTimes(1);
    expect(api.getFleetWorkorderAuthorization).toHaveBeenCalledWith('supplier-a', 'wo-1');
  });

  it('getWorkorderAuthorization() — maps FleetAuthorizationResponse field by field', () => {
    let result: SupplierFleetAuthorization | undefined;
    service.getWorkorderAuthorization(SUPPLIER_REF, WORKORDER_ID).subscribe(value => (result = value));

    expect(result).toEqual({
      workorderId: WORKORDER_ID,
      supplierRef: SUPPLIER_REF,
      state: 'GRANTED',
      vendorAuthorizationId: 'AUTH-88421',
      contractReference: 'MFS-2026-0044',
      vendorReason: null,
      vendorReasonCode: null,
      reviewReason: 'Approval endpoint rejected the completion payload three times.',
      authorizedAmount: 840,
      currency: 'EUR',
      requestedAt: '2026-08-12T09:00:00Z',
      decidedAt: '2026-08-12T09:04:00Z',
      completionApproval: 'MANUAL_REVIEW',
    });
  });

  it('getWorkorderAuthorization() — keeps the vendor refusal text and code verbatim on DENIED', () => {
    api.getFleetWorkorderAuthorization.mockReturnValue(
      of({ ...authorizationDto, status: 'DENIED', reasonCode: 'NOT_COVERED', reasonText: 'Vehicle no longer covered.' }),
    );
    let result: SupplierFleetAuthorization | undefined;
    service.getWorkorderAuthorization(SUPPLIER_REF, WORKORDER_ID).subscribe(value => (result = value));

    expect(result?.state).toBe('DENIED');
    expect(result?.vendorReason).toBe('Vehicle no longer covered.');
    expect(result?.vendorReasonCode).toBe('NOT_COVERED');
  });

  it('getWorkorderAuthorization() — an unknown status token maps to null rather than a guessed state', () => {
    api.getFleetWorkorderAuthorization.mockReturnValue(of({ ...authorizationDto, status: 'SOMETHING_NEW' }));
    let result: SupplierFleetAuthorization | undefined;
    service.getWorkorderAuthorization(SUPPLIER_REF, WORKORDER_ID).subscribe(value => (result = value));

    expect(result?.state).toBeNull();
  });

  it('exposes no request, grant, deny, override or escalate operation (#194 §6)', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      name => name !== 'constructor',
    );

    expect(methods).toEqual(['lookupVehicle', 'getWorkorderAuthorization']);
    expect(api.requestFleetWorkorderAuthorization).not.toHaveBeenCalled();
  });
});
