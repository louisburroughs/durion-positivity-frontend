import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { InventoryRollupService } from '@durion-sdk/inventory';
import { InventoryRollupApiService } from './inventory-rollup.service';
import {
  isRollupError,
  LocationInventoryRollupResponse,
  RollupError,
  SiteInventoryRollupResponse,
} from '../models/inventory-rollup.models';

describe('InventoryRollupApiService', () => {
  let service: InventoryRollupApiService;

  const sdkStub = {
    getSiteInventoryRollup: vi.fn(),
    getLocationInventoryRollup: vi.fn(),
  };

  const siteResponse: SiteInventoryRollupResponse = {
    siteId: 'site-1',
    totals: { onHand: 480, allocated: 30, available: 450 },
    nodes: [],
  };

  const locationResponse: LocationInventoryRollupResponse = {
    locationId: 'loc-1',
    parentType: 'PHYSICAL',
    totals: { onHand: 150, allocated: 15, available: 135 },
    sites: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: InventoryRollupService, useValue: sdkStub }],
    });
    service = TestBed.inject(InventoryRollupApiService);
  });

  function httpError(status: number, body?: unknown): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: body ?? null, url: '/test' });
  }

  function captureError(observable: Observable<unknown>): Promise<RollupError> {
    return new Promise((resolve, reject) => {
      observable.subscribe({
        next: () => reject(new Error('expected error')),
        error: (err: RollupError) => resolve(err),
        complete: () =>
          reject(new Error('expected the observable to error, but it completed')),
      });
    });
  }

  describe('getSiteRollup', () => {
    it('passes siteId and normalized options to the SDK', () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(of(siteResponse));

      let result: SiteInventoryRollupResponse | undefined;
      service
        .getSiteRollup('site-1', { sku: '  SKU-9  ', depth: 2, includeEmpty: true })
        .subscribe(value => (result = value));

      expect(sdkStub.getSiteInventoryRollup).toHaveBeenCalledWith('site-1', 'SKU-9', 2, true);
      expect(result).toEqual(siteResponse);
    });

    it('treats a blank sku as absent', () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(of(siteResponse));

      service.getSiteRollup('site-1', { sku: '   ' }).subscribe();

      expect(sdkStub.getSiteInventoryRollup).toHaveBeenCalledWith(
        'site-1',
        undefined,
        undefined,
        undefined,
      );
    });

    it('maps 404 to not-found with the ApiError message', async () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(
        throwError(() => httpError(404, { code: 'NOT_FOUND', message: 'Location not found: x' })),
      );

      const error = await captureError(service.getSiteRollup('site-1'));

      expect(error).toEqual({ kind: 'not-found', message: 'Location not found: x' });
    });

    it('maps 503 to retryable upstream-down', async () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(
        throwError(() =>
          httpError(503, { code: 'LOCATION_SERVICE_UNAVAILABLE', message: 'down' }),
        ),
      );

      const error = await captureError(service.getSiteRollup('site-1'));

      expect(error).toEqual({ kind: 'upstream-down', message: 'down', retryable: true });
    });

    it('maps network failure (status 0) to retryable upstream-down', async () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => httpError(0)));

      const error = await captureError(service.getSiteRollup('site-1'));

      expect(error).toMatchObject({ kind: 'upstream-down', retryable: true });
    });

    it('maps 403 to forbidden', async () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => httpError(403)));

      const error = await captureError(service.getSiteRollup('site-1'));

      expect(error.kind).toBe('forbidden');
    });

    it('maps 400 and 422 to validation', async () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => httpError(400)));
      expect((await captureError(service.getSiteRollup('site-1'))).kind).toBe('validation');

      sdkStub.getSiteInventoryRollup.mockReturnValue(
        throwError(() => httpError(422, { code: 'ROLLUP_EXPANSION_TOO_LARGE', message: 'cap' })),
      );
      expect((await captureError(service.getSiteRollup('site-1'))).kind).toBe('validation');
    });

    it('maps unexpected statuses and non-HTTP errors to unknown', async () => {
      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => httpError(500)));
      expect((await captureError(service.getSiteRollup('site-1'))).kind).toBe('unknown');

      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => new Error('boom')));
      const error = await captureError(service.getSiteRollup('site-1'));
      expect(error).toEqual({ kind: 'unknown', message: 'boom' });
    });

    it('falls back to the HttpErrorResponse message when the body has no string message', async () => {
      const emptyBody = httpError(404, {});
      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => emptyBody));
      expect(await captureError(service.getSiteRollup('site-1'))).toEqual({
        kind: 'not-found',
        message: emptyBody.message,
      });

      const nonStringMessage = httpError(404, { code: 'NOT_FOUND', message: 42 });
      sdkStub.getSiteInventoryRollup.mockReturnValue(throwError(() => nonStringMessage));
      expect(await captureError(service.getSiteRollup('site-1'))).toEqual({
        kind: 'not-found',
        message: nonStringMessage.message,
      });
    });
  });

  describe('getLocationRollup', () => {
    it('passes options through and never requests expand=tree', () => {
      sdkStub.getLocationInventoryRollup.mockReturnValue(of(locationResponse));

      let result: LocationInventoryRollupResponse | undefined;
      service
        .getLocationRollup('loc-1', { parentType: 'PHYSICAL', sku: 'SKU-1' })
        .subscribe(value => (result = value));

      expect(sdkStub.getLocationInventoryRollup).toHaveBeenCalledWith(
        'loc-1',
        'PHYSICAL',
        'SKU-1',
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(locationResponse);
    });

    it('treats a blank sku as absent', () => {
      sdkStub.getLocationInventoryRollup.mockReturnValue(of(locationResponse));

      service.getLocationRollup('loc-1', { sku: '   ' }).subscribe();

      expect(sdkStub.getLocationInventoryRollup).toHaveBeenCalledWith(
        'loc-1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('maps errors with the same union as the site rollup', async () => {
      sdkStub.getLocationInventoryRollup.mockReturnValue(throwError(() => httpError(404)));

      const error = await captureError(service.getLocationRollup('loc-1'));

      expect(error.kind).toBe('not-found');
    });
  });

  describe('isRollupError', () => {
    it('accepts every valid kind', () => {
      const kinds = ['not-found', 'upstream-down', 'forbidden', 'validation', 'unknown'] as const;
      for (const kind of kinds) {
        expect(isRollupError({ kind, message: 'm' }), kind).toBe(true);
      }
    });

    it('rejects an object with an unrecognized kind', () => {
      expect(isRollupError({ kind: 'nope', message: 'm' })).toBe(false);
    });

    it('rejects values that are not RollupError shapes', () => {
      expect(isRollupError(null)).toBe(false);
      expect(isRollupError(undefined)).toBe(false);
      expect(isRollupError('not-found')).toBe(false);
      expect(isRollupError(42)).toBe(false);
      expect(isRollupError({})).toBe(false);
      expect(isRollupError({ kind: 404 })).toBe(false);
    });
  });
});
