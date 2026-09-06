/**
 * Vendor PRICAT (price-catalog) freshness / imports / quarantine read client
 * (issue #213; backend PR #1644, closing #1637/#1638 row 1).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Backed by the generated `SupplierPriceCatalogService` from
 * `@durion-sdk/supplier` (ADR-0010: a feature never injects `HttpClient`). No
 * URL is spelled out here: the generated client is the contract.
 *
 * ── Untyped list items ───────────────────────────────────────────────────────
 * `listSupplierPriceCatalogImports` and `listSupplierPriceCatalogUnmatchedLines`
 * both return the generic `PagedResponse` shape (`items?: Array<any>`) rather
 * than a typed page — the generated client carries no per-item model for
 * these two reads. The field-by-field mapping below is this service's answer
 * to that: every field is read by name and defaulted explicitly, exactly the
 * way a typed DTO would be mapped elsewhere in this domain.
 *
 * ── Offset paging only ───────────────────────────────────────────────────────
 * Both lists take `page`/`size`; there is no `pageToken` protocol on this
 * contract, and none is used here.
 *
 * ── Filters are server-side ──────────────────────────────────────────────────
 * `bindingId`/`status`/`dateFrom`/`dateTo` on imports and
 * `reason`/`search`/`dateFrom`/`dateTo`/`resolved` on unmatched lines are all
 * real query parameters the backend applies — never a client-side
 * post-filter over an already-loaded page.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PagedResponse,
  PriceCatalogFreshnessView,
  SupplierPriceCatalogService as SupplierPriceCatalogApi,
} from '@durion-sdk/supplier';
import {
  PriceCatalogBindingFreshness,
  PriceCatalogFreshness,
  PriceCatalogImport,
  PriceCatalogImportFilter,
  PriceCatalogImportPage,
  PriceCatalogImportStatus,
  UnmatchedLineFilter,
  UnmatchedLinePage,
  UnmatchedLineReason,
  UnmatchedPriceCatalogLine,
} from '../models/supplier-pricecatalog.models';

/** Default page size for both PRICAT lists. The contract caps `size` at 200. */
export const PRICE_CATALOG_PAGE_SIZE = 25;

/** Raw shape of one `listSupplierPriceCatalogImports` item, per the backend record. */
interface RawPriceCatalogImport {
  importManifestId?: string;
  vendorProfileId?: string;
  supplierRef?: string;
  bindingId?: string;
  status?: string;
  fetchedAt?: string;
  completedAt?: string;
  sourceDocumentId?: string;
  sourceDocumentDate?: string;
  countryCode?: string;
  currency?: string;
  linesFetched?: number;
  linesMatched?: number;
  linesUnmatched?: number;
  linesDuplicate?: number;
  chunkCount?: number;
  errorCode?: string;
  failureDetail?: string;
  windowFrom?: string;
  windowTo?: string;
}

/** Raw shape of one `listSupplierPriceCatalogUnmatchedLines` item, per the backend record. */
interface RawUnmatchedLine {
  unmatchedLineId?: string;
  importManifestId?: string;
  vendorProfileId?: string;
  positionNumber?: number;
  articleEan?: string;
  supplierArticleCode?: string;
  xReferenceCode?: string;
  reason?: string;
  reasonDetail?: string;
  netPrice?: number;
  grossPrice?: number;
  effectiveFrom?: string;
  currency?: string;
  fetchedAt?: string;
  resolvedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SupplierPriceCatalogService {
  private readonly api = inject(SupplierPriceCatalogApi);

  /** Freshness of one vendor's price catalog: vendor-stated vs platform-retrieved. */
  getFreshness(vendorProfileId: string): Observable<PriceCatalogFreshness> {
    return this.api
      .getSupplierPriceCatalogFreshness(vendorProfileId)
      .pipe(map(view => this.toFreshness(view)));
  }

  /**
   * One page of PRICAT import runs for a vendor profile, newest first.
   *
   * @param page zero-based page index
   */
  listImports(
    vendorProfileId: string,
    filter: PriceCatalogImportFilter = {},
    page = 0,
    size = PRICE_CATALOG_PAGE_SIZE,
  ): Observable<PriceCatalogImportPage> {
    return this.api
      .listSupplierPriceCatalogImports(
        vendorProfileId,
        filter.bindingId || undefined,
        filter.status,
        filter.dateFrom || undefined,
        filter.dateTo || undefined,
        page,
        size,
      )
      .pipe(map(response => this.toImportPage(response)));
  }

  /**
   * One page of quarantined PRICAT lines for a vendor profile, newest first.
   * Open lines only unless `filter.resolved` is `true`.
   *
   * @param page zero-based page index
   */
  listUnmatchedLines(
    vendorProfileId: string,
    filter: UnmatchedLineFilter = {},
    page = 0,
    size = PRICE_CATALOG_PAGE_SIZE,
  ): Observable<UnmatchedLinePage> {
    return this.api
      .listSupplierPriceCatalogUnmatchedLines(
        vendorProfileId,
        filter.reason,
        filter.search || undefined,
        filter.dateFrom || undefined,
        filter.dateTo || undefined,
        filter.resolved,
        page,
        size,
      )
      .pipe(map(response => this.toUnmatchedLinePage(response)));
  }

  // ── Mapping (SDK view ⇄ domain model) ──────────────────────────────────────

  private toFreshness(view: PriceCatalogFreshnessView): PriceCatalogFreshness {
    return {
      vendorProfileId: view.vendorProfileId ?? '',
      latestEffectiveDate: view.latestEffectiveDate ?? null,
      lastFetchedAt: view.lastFetchedAt ?? null,
      lastCompletedAt: view.lastCompletedAt ?? null,
      unresolvedUnmatchedCount: view.unresolvedUnmatchedCount ?? 0,
      stalenessThreshold: view.stalenessThreshold ?? null,
      stale: view.stale ?? false,
      bindings: (view.bindings ?? []).map(binding => this.toBindingFreshness(binding)),
    };
  }

  private toBindingFreshness(binding: {
    bindingId?: string;
    enabled?: boolean;
    scheduleCron?: string;
    checkpointAt?: string;
    lastRunOutcome?: string;
    lastRunStartedAt?: string;
  }): PriceCatalogBindingFreshness {
    return {
      bindingId: binding.bindingId ?? '',
      enabled: binding.enabled ?? false,
      scheduleCron: binding.scheduleCron ?? null,
      checkpointAt: binding.checkpointAt ?? null,
      lastRunOutcome: binding.lastRunOutcome ?? null,
      lastRunStartedAt: binding.lastRunStartedAt ?? null,
    };
  }

  private toImportPage(response: PagedResponse): PriceCatalogImportPage {
    const items = (response.items ?? []) as RawPriceCatalogImport[];
    return {
      items: items.map(item => this.toImport(item)),
      page: response.page ?? 0,
      size: response.size ?? PRICE_CATALOG_PAGE_SIZE,
      totalCount: response.totalElements ?? 0,
      totalPages: response.totalPages ?? 0,
    };
  }

  private toImport(item: RawPriceCatalogImport): PriceCatalogImport {
    return {
      importManifestId: item.importManifestId ?? '',
      vendorProfileId: item.vendorProfileId ?? '',
      supplierRef: item.supplierRef ?? null,
      bindingId: item.bindingId ?? null,
      status: (item.status as PriceCatalogImportStatus) ?? null,
      fetchedAt: item.fetchedAt ?? null,
      completedAt: item.completedAt ?? null,
      sourceDocumentId: item.sourceDocumentId ?? null,
      sourceDocumentDate: item.sourceDocumentDate ?? null,
      countryCode: item.countryCode ?? null,
      currency: item.currency ?? null,
      linesFetched: item.linesFetched ?? null,
      linesMatched: item.linesMatched ?? null,
      linesUnmatched: item.linesUnmatched ?? null,
      linesDuplicate: item.linesDuplicate ?? null,
      chunkCount: item.chunkCount ?? null,
      errorCode: item.errorCode ?? null,
      failureDetail: item.failureDetail ?? null,
      windowFrom: item.windowFrom ?? null,
      windowTo: item.windowTo ?? null,
    };
  }

  private toUnmatchedLinePage(response: PagedResponse): UnmatchedLinePage {
    const items = (response.items ?? []) as RawUnmatchedLine[];
    return {
      items: items.map(item => this.toUnmatchedLine(item)),
      page: response.page ?? 0,
      size: response.size ?? PRICE_CATALOG_PAGE_SIZE,
      totalCount: response.totalElements ?? 0,
      totalPages: response.totalPages ?? 0,
    };
  }

  private toUnmatchedLine(item: RawUnmatchedLine): UnmatchedPriceCatalogLine {
    return {
      unmatchedLineId: item.unmatchedLineId ?? '',
      importManifestId: item.importManifestId ?? '',
      vendorProfileId: item.vendorProfileId ?? '',
      positionNumber: item.positionNumber ?? null,
      articleEan: item.articleEan ?? null,
      supplierArticleCode: item.supplierArticleCode ?? null,
      xReferenceCode: item.xReferenceCode ?? null,
      reason: (item.reason as UnmatchedLineReason) ?? null,
      reasonDetail: item.reasonDetail ?? null,
      netPrice: item.netPrice ?? null,
      grossPrice: item.grossPrice ?? null,
      effectiveFrom: item.effectiveFrom ?? null,
      currency: item.currency ?? null,
      fetchedAt: item.fetchedAt ?? '',
      resolvedAt: item.resolvedAt ?? null,
    };
  }
}
