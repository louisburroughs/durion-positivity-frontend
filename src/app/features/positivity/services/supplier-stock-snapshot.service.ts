/**
 * Vendor stock-snapshot read client (issue #217; backend PR #1644, closing
 * #1638 row 6).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Backed by the generated `SupplierStockSnapshotsService` from
 * `@durion-sdk/supplier` (ADR-0010: a feature never injects `HttpClient`). No
 * URL is spelled out here: the generated client is the contract.
 *
 * ── Resolve the snapshot id first, always ───────────────────────────────────
 * `listLines` takes an explicit `snapshotId`, never "latest": a snapshot is
 * append-only, so every page of one browse must describe the same document
 * even if a newer report arrives mid-browse. Callers get that id from
 * `getLatestSnapshot()` and must never re-derive or guess one.
 *
 * ── Untyped list items ───────────────────────────────────────────────────────
 * `listSupplierStockSnapshotLines` returns the generic `PagedResponse` shape
 * (`items?: Array<any>`) — the generated client carries no per-item model for
 * it. The field-by-field mapping below reads each field by name, exactly as a
 * typed DTO would be mapped elsewhere in this domain.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PagedResponse,
  StockSnapshotSummary as SdkStockSnapshotSummary,
  SupplierStockSnapshotsService as SupplierStockSnapshotsApi,
} from '@durion-sdk/supplier';
import {
  StockSnapshotLine,
  StockSnapshotLinePage,
  StockSnapshotStatus,
  StockSnapshotSummary,
} from '../models/supplier-stock-snapshot.models';

/** Default page size for the snapshot-lines browse. The contract caps `size` at 200. */
export const STOCK_SNAPSHOT_LINES_PAGE_SIZE = 25;

/** Raw shape of one `listSupplierStockSnapshotLines` item, per the backend record. */
interface RawStockSnapshotLine {
  lineId?: string;
  vendorLineId?: string;
  articleEan?: string;
  supplierArticleCode?: string;
  buyersArticleId?: string;
  description?: string;
  availableQuantity?: number;
}

@Injectable({ providedIn: 'root' })
export class SupplierStockSnapshotService {
  private readonly api = inject(SupplierStockSnapshotsApi);

  /** The profile's newest stock-snapshot metadata, without lines. 404 when the profile has no snapshot. */
  getLatestSnapshot(vendorProfileId: string): Observable<StockSnapshotSummary> {
    return this.api
      .getLatestSupplierStockSnapshot(vendorProfileId)
      .pipe(map(view => this.toSummary(view)));
  }

  /**
   * One page of a snapshot's lines, in the vendor document's own order.
   *
   * @param snapshotId the immutable id from `getLatestSnapshot()` — never re-derived
   * @param page zero-based page index
   */
  listLines(
    vendorProfileId: string,
    snapshotId: string,
    search = '',
    page = 0,
    size = STOCK_SNAPSHOT_LINES_PAGE_SIZE,
  ): Observable<StockSnapshotLinePage> {
    return this.api
      .listSupplierStockSnapshotLines(vendorProfileId, snapshotId, search || undefined, page, size)
      .pipe(map(response => this.toLinePage(response)));
  }

  // ── Mapping (SDK view ⇄ domain model) ──────────────────────────────────────

  private toSummary(view: SdkStockSnapshotSummary): StockSnapshotSummary {
    return {
      snapshotId: view.snapshotId ?? '',
      vendorProfileId: view.vendorProfileId ?? '',
      supplierRef: view.supplierRef ?? null,
      buyerAccountNumber: view.buyerAccountNumber ?? null,
      countryCode: view.countryCode ?? null,
      documentId: view.documentId ?? null,
      issuedOn: view.issuedOn ?? null,
      snapshotAsOf: view.snapshotAsOf ?? null,
      fetchedAt: view.fetchedAt ?? null,
      completedAt: view.completedAt ?? null,
      status: (view.status as StockSnapshotStatus) ?? null,
      protocolVersion: view.protocolVersion ?? null,
      linesReported: view.linesReported ?? null,
      linesRejected: view.linesRejected ?? null,
    };
  }

  private toLinePage(response: PagedResponse): StockSnapshotLinePage {
    const items = (response.items ?? []) as RawStockSnapshotLine[];
    return {
      items: items.map(item => this.toLine(item)),
      page: response.page ?? 0,
      size: response.size ?? STOCK_SNAPSHOT_LINES_PAGE_SIZE,
      totalCount: response.totalElements ?? 0,
      totalPages: response.totalPages ?? 0,
    };
  }

  private toLine(item: RawStockSnapshotLine): StockSnapshotLine {
    return {
      lineId: item.lineId ?? '',
      vendorLineId: item.vendorLineId ?? null,
      articleEan: item.articleEan ?? null,
      supplierArticleCode: item.supplierArticleCode ?? null,
      buyersArticleId: item.buyersArticleId ?? null,
      description: item.description ?? null,
      availableQuantity: item.availableQuantity ?? null,
    };
  }
}
