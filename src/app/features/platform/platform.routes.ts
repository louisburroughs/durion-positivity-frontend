import { Routes } from '@angular/router';
import { PLATFORM_PAGE } from '../../core/security/route-permissions';
import { PlatformComponent } from './platform.component';

/**
 * Platform operator area (ADR-0062 §7): the tenant registry.
 *
 * The group `/app/platform` is gated on the tenant list read (falling back to
 * `ROLE_PLATFORM_ADMIN` for a token without `perm_bits`), because the empty
 * path lands on that list; see `PLATFORM_PERMISSIONS`. Each page then declares
 * the authority its primary read or write needs (`PLATFORM_PAGE`), so an
 * operator missing one bit is told no here instead of by the page's first
 * request. `rolesChildGuard` runs at every level, so both must pass.
 */
export const PLATFORM_ROUTES: Routes = [
  {
    path: '',
    component: PlatformComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tenants' },
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
