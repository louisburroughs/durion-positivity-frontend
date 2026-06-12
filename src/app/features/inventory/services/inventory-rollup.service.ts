import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { InventoryRollupService } from '@durion-sdk/inventory';
import {
  LocationInventoryRollupResponse,
  LocationRollupOptions,
  RollupError,
  SiteInventoryRollupResponse,
  SiteRollupOptions,
} from '../models/inventory-rollup.models';

/**
 * Facade over the generated {@link InventoryRollupService} SDK client
 * (CAP-218 frontend story F1).
 *
 * Responsibilities: parameter normalization, mapping transport errors to
 * the {@link RollupError} discriminated union for the views. Views depend
 * on this facade, never on the SDK client directly (spec §2a/§4.2).
 *
 * Authorization note: per current module convention, route-level role data
 * is not declared for read views; the backend enforces
 * `inventory:on_hand:view` and a 403 surfaces as `kind: 'forbidden'`
 * (spec open question 2).
 */
@Injectable({ providedIn: 'root' })
export class InventoryRollupApiService {
  private readonly rollupSdk = inject(InventoryRollupService);

  /**
   * Storage-location rollup tree for one site
   * (`GET /v1/inventory/sites/{siteId}/inventory-rollup`).
   */
  getSiteRollup(
    siteId: string,
    options: SiteRollupOptions = {},
  ): Observable<SiteInventoryRollupResponse> {
    return this.rollupSdk
      .getSiteInventoryRollup(
        siteId,
        normalizeSku(options.sku),
        options.depth,
        options.includeEmpty,
      )
      .pipe(catchError(error => throwError(() => toRollupError(error))));
  }

  /**
   * Per-site summaries plus grand total for a parent location
   * (`GET /v1/inventory/locations/{locationId}/inventory-rollup`).
   * v1 never requests `expand=tree`, so the descendant-site cap (422)
   * cannot be hit from this facade.
   */
  getLocationRollup(
    locationId: string,
    options: LocationRollupOptions = {},
  ): Observable<LocationInventoryRollupResponse> {
    return this.rollupSdk
      .getLocationInventoryRollup(
        locationId,
        options.parentType,
        normalizeSku(options.sku),
        undefined, // expand — intentionally never 'tree' in v1
        undefined, // depth — only meaningful with expand=tree
        undefined, // includeEmpty — only meaningful with expand=tree
      )
      .pipe(catchError(error => throwError(() => toRollupError(error))));
  }
}

function normalizeSku(sku: string | undefined): string | undefined {
  const trimmed = sku?.trim();
  return trimmed ? trimmed : undefined;
}

function toRollupError(error: unknown): RollupError {
  if (error instanceof HttpErrorResponse) {
    const message = extractMessage(error);
    switch (error.status) {
      case 404:
        return { kind: 'not-found', message };
      case 403:
        return { kind: 'forbidden', message };
      case 400:
      case 422:
        return { kind: 'validation', message };
      case 0: // network/connection failure
      case 503:
        return { kind: 'upstream-down', message, retryable: true };
      default:
        return { kind: 'unknown', message };
    }
  }
  return { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };
}

function extractMessage(error: HttpErrorResponse): string {
  const body = error.error as { message?: unknown; code?: unknown } | null | undefined;
  if (body && typeof body.message === 'string' && body.message) {
    return body.message;
  }
  return error.message;
}
