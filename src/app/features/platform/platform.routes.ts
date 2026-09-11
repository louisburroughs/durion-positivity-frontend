import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { canAccess } from '../../core/security/route-access';
import { PLATFORM_PAGE } from '../../core/security/route-permissions';
import { AuthService } from '../../core/services/auth.service';
import { PlatformComponent } from './platform.component';

/**
 * Where the group's empty path lands: the tenant list when the session may
 * read it, else the create form — the only other page here, so a create-only
 * session (which registers tenants by account id) is not sent to /forbidden
 * by a redirect it can never follow. A session that can open neither is
 * refused by the group gate before this runs.
 */
export function platformLanding(): string {
  const auth = inject(AuthService);
  const canRead = canAccess(auth, {
    permissions: PLATFORM_PAGE.tenantRead,
    roles: ['ROLE_PLATFORM_ADMIN'],
  });
  return canRead ? 'tenants' : 'tenants/new';
}

/**
 * Platform operator area (ADR-0062 §7): the tenant registry.
 *
 * The group `/app/platform` admits the union of its pages' gates (falling
 * back to `ROLE_PLATFORM_ADMIN` for a token without `perm_bits`); see
 * `PLATFORM_PERMISSIONS`. Each page then declares the authority its primary
 * read or write needs (`PLATFORM_PAGE`), so an operator missing one bit is
 * told no here instead of by the page's first request. `rolesChildGuard` runs
 * at every level, so both must pass.
 */
export const PLATFORM_ROUTES: Routes = [
  {
    path: '',
    component: PlatformComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: platformLanding },
      {
        path: 'tenants',
        data: { permissions: PLATFORM_PAGE.tenantRead },
        loadComponent: () =>
          import('./pages/tenant-list/tenant-list-page.component').then(
            m => m.TenantListPageComponent,
          ),
      },
      {
        path: 'tenants/new',
        data: { permissions: PLATFORM_PAGE.tenantCreate },
        loadComponent: () =>
          import('./pages/tenant-create/tenant-create-page.component').then(
            m => m.TenantCreatePageComponent,
          ),
      },
      {
        path: 'tenants/:id',
        data: { permissions: PLATFORM_PAGE.tenantRead },
        loadComponent: () =>
          import('./pages/tenant-detail/tenant-detail-page.component').then(
            m => m.TenantDetailPageComponent,
          ),
      },
      { path: '**', redirectTo: 'tenants' },
    ],
  },
];
