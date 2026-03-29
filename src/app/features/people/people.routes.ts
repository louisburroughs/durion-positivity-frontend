import { Routes } from '@angular/router';
import { PeopleComponent } from './people.component';

export const PEOPLE_ROUTES: Routes = [
  {
    path: '',
    component: PeopleComponent,
    children: [
      {
        path: 'rbac/:personUuid',
        loadComponent: () =>
          import('./pages/role-assignment/role-assignment-page.component')
            .then(m => m.RoleAssignmentPageComponent),
      },
      {
        path: 'timekeeping/approval',
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
        loadComponent: () => import('./pages/time-export/time-export-page.component').then(m => m.TimeExportPageComponent),
      },
      {
        path: 'timekeeping/discrepancy',
        loadComponent: () =>
          import('./pages/discrepancy-report/discrepancy-report-page.component')
            .then(m => m.DiscrepancyReportPageComponent),
      },
      {
        path: 'employees/new',
        loadComponent: () =>
          import('./pages/employee-profile/employee-profile-page.component')
            .then(m => m.EmployeeProfilePageComponent),
      },
      {
        path: 'employees/:id',
        loadComponent: () =>
          import('./pages/employee-profile/employee-profile-page.component')
            .then(m => m.EmployeeProfilePageComponent),
      },
      {
        path: 'employees/:id/offboard',
        loadComponent: () =>
          import('./pages/employee-offboard/employee-offboard-page.component')
            .then(m => m.EmployeeOffboardPageComponent),
      },
      {
        path: 'person/:personId/locations',
        loadComponent: () =>
          import('./pages/person-location-assignments/person-location-assignments-page.component')
            .then(m => m.PersonLocationAssignmentsPageComponent),
      },
    ],
  },
];
