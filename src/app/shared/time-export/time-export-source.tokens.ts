import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/** Body `TimeExportPageComponent` submits to request a payroll time export. */
export interface TimeExportRequestBody {
  readonly startDate: string;
  readonly endDate: string;
  // Mutable to match AccountingService.requestExport's parameter shape exactly.
  readonly locationIds: string[];
  readonly format: 'CSV' | 'JSON';
}

/**
 * Minimal, display-only shape `TimeExportPageComponent` needs for job status polling.
 * Kept separate from `accounting`'s SDK-shaped export models so `shared/**` never
 * depends on `features/**` (LAY-02).
 */
export interface TimeExportJobStatus {
  readonly exportId: string;
  readonly status: string;
  readonly recordsExportedCount?: number;
  readonly recordsSkippedCount?: number;
  readonly requestedAt?: string;
  readonly completedAt?: string;
  readonly errorCode?: string;
  readonly message?: string;
}

/**
 * Inversion point for the payroll time-export read/action set: `people`'s time-export
 * page only knows this contract, never `AccountingService` directly. The `accounting`
 * feature provides the real implementation once, at the composition root
 * (`app.config.ts`), via `provideAccountingTimeExportSource()`.
 */
export interface TimeExportSource {
  requestExport(
    body: TimeExportRequestBody,
    idempotencyKey?: string,
  ): Observable<{ readonly exportId: string; readonly status: string }>;
  getExportStatus(exportId: string): Observable<TimeExportJobStatus>;
  getExportHistory(params?: { pageIndex?: number; pageSize?: number }): Observable<readonly unknown[]>;
  /**
   * Triggers the browser download. Returns an `Observable<void>` — rather than
   * firing the download and forgetting it — so the page can subscribe and
   * surface a chunk-load failure (the lazy `import()` behind this contract can
   * reject) instead of leaving it as an unhandled rejection.
   */
  downloadExport(exportId: string): Observable<void>;
}

export const TIME_EXPORT_SOURCE = new InjectionToken<TimeExportSource>('TIME_EXPORT_SOURCE');
