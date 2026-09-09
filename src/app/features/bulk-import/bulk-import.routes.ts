import { Routes } from '@angular/router';
import { BULK_IMPORT_PAGE } from '../../core/security/route-permissions';
import { BulkImportComponent } from './bulk-import.component';

/**
 * Pages declare the permission their primary read needs (`BULK_IMPORT_PAGE`), on top of
 * the group gate `/app/bulk-import` already carries. `rolesChildGuard` runs at every
 * level, so both must pass. See `core/security/route-permissions.ts` for how
 * each code was traced to the backend controller that enforces it.
 */
export const BULK_IMPORT_ROUTES: Routes = [
  {
    path: '',
    component: BulkImportComponent,
    children: [
      {
        path: 'jobs',
        data: { permissions: BULK_IMPORT_PAGE.jobs },
        loadComponent: () =>
          import('./pages/jobs/bulk-import-jobs-page.component').then(
            m => m.BulkImportJobsPageComponent,
          ),
      },
      {
        path: 'jobs/:jobId',
        data: { permissions: BULK_IMPORT_PAGE.jobs },
        loadComponent: () =>
          import('./pages/job-detail/bulk-import-job-detail-page.component').then(
            m => m.BulkImportJobDetailPageComponent,
          ),
      },
      { path: '', redirectTo: 'jobs', pathMatch: 'full' },
    ],
  },
];
