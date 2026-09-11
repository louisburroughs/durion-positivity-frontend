import { Routes } from '@angular/router';
import { PEOPLE_PAGE } from '../../core/security/route-permissions';
import { PeopleComponent } from './people.component';

/**
 * Pages declare the permission their primary read needs (`PEOPLE_PAGE`), on top
 * of the group gate `/app/people` already carries. `rolesChildGuard` runs at
 * every level, so both must pass. See `core/security/route-permissions.ts` for
 * how each code was traced to the backend controller that enforces it.
 */
export const PEOPLE_ROUTES: Routes = [
  {
    path: '',
    component: PeopleComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/landing/people-landing-page.component').then(
            m => m.PeopleLandingPageComponent,
          ),
      },
      {
        path: 'rbac/:personUuid',
        data: { permissions: PEOPLE_PAGE.roleAssignment },
        loadComponent: () =>
          import('./pages/role-assignment/role-assignment-page.component')
            .then(m => m.RoleAssignmentPageComponent),
      },
      {
        path: 'timekeeping/approval',
        data: { permissions: PEOPLE_PAGE.timeApproval },
        loadComponent: () => import('./pages/time-approval/time-approval-page.component').then(m => m.TimeApprovalPageComponent),
      },
      {
        path: 'timekeeping/work-session/:sessionId/submit',
        loadComponent: () =>
          import('./pages/work-session-submit/work-session-submit-page.component').then(
            m => m.WorkSessionSubmitPageComponent,
          ),
      },
      {
        path: 'timekeeping/work-session',
        loadComponent: () => import('./pages/work-session/work-session-page.component').then(m => m.WorkSessionPageComponent),
      },
      {
        path: 'timekeeping/export',
        data: { permissions: PEOPLE_PAGE.timeExport },
        loadComponent: () => import('./pages/time-export/time-export-page.component').then(m => m.TimeExportPageComponent),
      },
      {
        path: 'timekeeping/discrepancy',
        data: { permissions: PEOPLE_PAGE.discrepancyReport },
        loadComponent: () =>
          import('./pages/discrepancy-report/discrepancy-report-page.component')
            .then(m => m.DiscrepancyReportPageComponent),
      },
      {
        path: 'employees/new',
        data: { permissions: PEOPLE_PAGE.employeeCreate },
        loadComponent: () =>
          import('./pages/employee-profile/employee-profile-page.component')
            .then(m => m.EmployeeProfilePageComponent),
      },
      {
        path: 'employees/:id',
        data: { permissions: PEOPLE_PAGE.employeeDetail },
        loadComponent: () =>
          import('./pages/employee-profile/employee-profile-page.component')
            .then(m => m.EmployeeProfilePageComponent),
      },
      {
        path: 'employees/:id/offboard',
        data: { permissions: PEOPLE_PAGE.employeeOffboard },
        loadComponent: () =>
          import('./pages/employee-offboard/employee-offboard-page.component')
            .then(m => m.EmployeeOffboardPageComponent),
      },
      {
        path: 'person/:personId/locations',
        data: { permissions: PEOPLE_PAGE.locationAssignments },
        loadComponent: () =>
          import('./pages/person-location-assignments/person-location-assignments-page.component')
            .then(m => m.PersonLocationAssignmentsPageComponent),
      },
      {
        path: 'bulk-import/people',
        data: { permissions: PEOPLE_PAGE.bulkImport },
        loadComponent: () =>
          import('./pages/bulk-import/people-bulk-import-page.component').then(
            m => m.PeopleBulkImportPageComponent,
          ),
      },
      {
        path: 'directory',
        data: { permissions: PEOPLE_PAGE.directory },
        loadComponent: () =>
          import('./pages/directory/people-directory-page.component').then(
            m => m.PeopleDirectoryPageComponent,
          ),
      },
      {
        // HR-scoped compliance report. The ROLE_ADMIN stand-in here predates the
        // permission gate (#235); the backend authority is people:compliance:view,
        // so gate on that and let an admin without it be told no at the boundary.
        path: 'identity-compliance',
        data: { permissions: PEOPLE_PAGE.identityCompliance },
        loadComponent: () =>
          import('./pages/identity-compliance/identity-compliance-page.component').then(
            m => m.IdentityCompliancePageComponent,
          ),
      },
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];
