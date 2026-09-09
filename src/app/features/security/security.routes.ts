import { Routes } from '@angular/router';
import { SECURITY_PAGE } from '../../core/security/route-permissions';
import { SecurityComponent } from './security.component';
import { SecurityAuditListPageComponent } from './pages/audit/security-audit-list/security-audit-list-page.component';
import { PermissionsListPageComponent } from './pages/permissions/permissions-list/permissions-list-page.component';
import { RoleDetailPageComponent } from './pages/roles/role-detail/role-detail-page.component';
import { RolesListPageComponent } from './pages/roles/roles-list/roles-list-page.component';

/**
 * Pages declare the permission their primary read needs (`SECURITY_PAGE`). The
 * group `/app/security` is gated on `ROLE_ADMIN` rather than on permissions, so
 * these are the first permission check an admin meets — an admin whose token
 * lacks the bit is now told no here instead of by the page's first request.
 */
export const SECURITY_ROUTES: Routes = [
  {
    path: '',
    component: SecurityComponent,
    children: [
      { path: '', data: { permissions: SECURITY_PAGE.roles }, component: RolesListPageComponent },
      {
        path: 'roles/:name',
        data: { permissions: SECURITY_PAGE.roles },
        component: RoleDetailPageComponent,
      },
      {
        path: 'permissions',
        data: { permissions: SECURITY_PAGE.permissions },
        component: PermissionsListPageComponent,
      },
      {
        path: 'audit',
        data: { permissions: SECURITY_PAGE.shopAudit },
        component: SecurityAuditListPageComponent,
      },
      {
        path: 'audit-logs',
        data: { permissions: SECURITY_PAGE.auditLogs },
        loadComponent: () =>
          import('./pages/audit-logs/audit-logs.component')
            .then(m => m.AuditLogsComponent),
      },
      {
        path: 'users/provision',
        data: { permissions: SECURITY_PAGE.userProvision },
        loadComponent: () =>
          import('./pages/user-provision/user-provision-page.component')
            .then(m => m.UserProvisionPageComponent),
      },
    ],
  },
];
