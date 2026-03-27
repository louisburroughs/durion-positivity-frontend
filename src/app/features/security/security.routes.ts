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
    ],
  },
];
