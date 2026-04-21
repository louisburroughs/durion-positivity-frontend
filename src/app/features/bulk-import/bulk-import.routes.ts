import { Routes } from '@angular/router';
import { BulkImportComponent } from './bulk-import.component';

export const BULK_IMPORT_ROUTES: Routes = [
  {
    path: '',
    component: BulkImportComponent,
    children: [
      {
        path: 'jobs',
        loadComponent: () =>
          import('./pages/jobs/bulk-import-jobs-page.component').then(
            m => m.BulkImportJobsPageComponent,
          ),
      },
      {
        path: 'jobs/:jobId',
        loadComponent: () =>
          import('./pages/job-detail/bulk-import-job-detail-page.component').then(
            m => m.BulkImportJobDetailPageComponent,
          ),
      },
      { path: '', redirectTo: 'jobs', pathMatch: 'full' },
    ],
  },
];
