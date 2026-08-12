/**
 * Vendor stock-snapshot client (issue #193, CAP-322).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers issue #188 only and exposes no stock-snapshot
 * operation; `@durion-sdk/inventory` covers *owned* stock and deliberately
 * carries nothing vendor-reported. This service therefore calls
 * `ApiBaseService` (ADR-0010 — never `HttpClient` in a feature), as the PRICAT
 * and availability surfaces do, with the assumed contract recorded here.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1228.
 *
 *   GET /supplier/v1/vendor-profiles/{vendorProfileId}/stock-snapshots/latest
 *       ?scopeCode&search
 *       → 200 SupplierStockSnapshot
 *       → 403 caller may not read vendor stock snapshots
 *       → 404 vendor has published no snapshot yet
 *       → 5xx retryable
 *
 * ── Reads only, and never merged with owned stock ───────────────────────────
 * There is no write path, and this service must never be joined to an inventory
 * on-hand read to produce a combined figure. Vendor stock is informational: it
 * says what a supplier claims it holds, not what this business owns. A single
 * number blending the two would be wrong for ordering, wrong for counting and
 * wrong for accounting simultaneously. Quantities are returned exactly as
 * delivered — a `null` quantity means the vendor did not report the product and
 * is never coalesced to `0`.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierStockSnapshot,
  SupplierStockSnapshotFilter,
} from '../models/supplier-stock-snapshot.models';

const ROOT = '/supplier/v1/vendor-profiles';

@Injectable({ providedIn: 'root' })
export class SupplierStockSnapshotService {
  private readonly api = inject(ApiBaseService);

  /** Latest published snapshot for one vendor, optionally scoped and filtered. */
  getLatestSnapshot(
    vendorProfileId: string,
    filter: SupplierStockSnapshotFilter = {},
  ): Observable<SupplierStockSnapshot> {
    let params = new HttpParams();
    if (filter.scopeCode) {
      params = params.set('scopeCode', filter.scopeCode);
    }
    if (filter.search) {
      params = params.set('search', filter.search);
    }
    return this.api.get<SupplierStockSnapshot>(
      `${ROOT}/${vendorProfileId}/stock-snapshots/latest`,
      params,
    );
  }
}
