import { EnvironmentInjector, Provider, inject, runInInjectionContext } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  TIME_EXPORT_SOURCE,
  TimeExportRequestBody,
  TimeExportSource,
} from '../../../shared/time-export/time-export-source.tokens';
import type { AccountingService } from './accounting.service';

/**
 * Registers the `accounting`-backed implementation of `shared/time-export`'s
 * `TimeExportSource` contract. Registered once, at the composition root
 * (`app.config.ts`), so `people`'s time-export page needs no import from
 * `accounting` directly (LAY-03).
 *
 * `AccountingService` (and the generated `@durion-sdk/accounting` API classes it
 * wraps) is loaded via a dynamic `import()` rather than a static one, so it lands
 * in its own chunk and is fetched only the first time a time export actually
 * runs, instead of being pulled into the initial bundle by `app.config.ts`.
 */
export function provideAccountingTimeExportSource(): Provider {
  return {
    provide: TIME_EXPORT_SOURCE,
    useFactory: (): TimeExportSource => {
      const injector = inject(EnvironmentInjector);
      let accountingPromise: Promise<AccountingService> | undefined;
      const getAccounting = (): Promise<AccountingService> => {
        accountingPromise ??= import('./accounting.service').then(({ AccountingService }) =>
          runInInjectionContext(injector, () => inject(AccountingService)),
        );
        return accountingPromise;
      };
      return {
        requestExport: (body: TimeExportRequestBody, idempotencyKey?: string) =>
          from(getAccounting()).pipe(
            switchMap(accounting => accounting.requestExport(body, idempotencyKey)),
          ),
        getExportStatus: (exportId: string) =>
          from(getAccounting()).pipe(switchMap(accounting => accounting.getExportStatus(exportId))),
        getExportHistory: (params?: { pageIndex?: number; pageSize?: number }) =>
          from(getAccounting()).pipe(switchMap(accounting => accounting.getExportHistory(params))),
        downloadExport: (exportId: string): Observable<void> =>
          from(getAccounting()).pipe(map(accounting => accounting.downloadExport(exportId))),
      };
    },
  };
}
