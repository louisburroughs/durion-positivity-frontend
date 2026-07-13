import { Routes } from '@angular/router';
import { SecurityComponent } from './security.component';
import { SecurityAuditListPageComponent } from './pages/audit/security-audit-list/security-audit-list-page.component';
import { PermissionsListPageComponent } from './pages/permissions/permissions-list/permissions-list-page.component';
import { RoleDetailPageComponent } from './pages/roles/role-detail/role-detail-page.component';
import { RolesListPageComponent } from './pages/roles/roles-list/roles-list-page.component';

export const SECURITY_ROUTES: Routes = [
  {
    path: '',
    component: SecurityComponent,
    children: [
      { path: '', component: RolesListPageComponent },
      { path: 'roles/:name', component: RoleDetailPageComponent },
      { path: 'permissions', component: PermissionsListPageComponent },
      { path: 'audit', component: SecurityAuditListPageComponent },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./pages/audit-logs/audit-logs.component')
            .then(m => m.AuditLogsComponent),
      },
      {
        path: 'users/provision',
        loadComponent: () =>
          import('./pages/user-provision/user-provision-page.component')
            .then(m => m.UserProvisionPageComponent),
      },
    ],
  },
];
