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
        path: 'timekeeping/work-session',
        loadComponent: () => import('./pages/work-session/work-session-page.component').then(m => m.WorkSessionPageComponent),
      },
      {
        path: 'timekeeping/export',
        loadComponent: () => import('./pages/time-export/time-export-page.component').then(m => m.TimeExportPageComponent),
      },
    ],
  },
];
