import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { rolesChildGuard } from './core/guards/roles.guard';

/**
 * App-level route table.
 *
 * Public:
 *   /login    → LoginComponent
 *
 * Protected (authGuard):
 *   /app      → ShellComponent
 *     /app    → DashboardComponent (default child)
 *
 * Optional role constraints can be declared per child route:
 *   data: { roles: ['ROLE_ADMIN'] }
 *
 * Extensibility:
 *   Add new domain feature modules as additional lazy-loaded children of the
 *   /app shell route. Example:
 *
 *     {
 *       path: 'orders',
 *       loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
 *     }
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./features/system/access-denied.component').then(
        m => m.AccessDeniedComponent,
      ),
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./features/system/not-found.component').then(m => m.NotFoundComponent),
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./features/shell/components/chat-panel/chat-panel.component').then(
        m => m.ChatPanelComponent,
      ),
  },
  {
    path: 'app',
    loadComponent: () =>
      import('./features/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    canActivateChild: [rolesChildGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shell/dashboard/dashboard.component').then(
            m => m.DashboardComponent,
          ),
      },
      {
        path: 'admin',
        data: { roles: ['ROLE_ADMIN'] },
        loadComponent: () =>
          import('./features/admin/admin.component').then(m => m.AdminComponent),
      },
      // Future enhancement: register lazy-loaded domain feature routes here, e.g.:
      // { path: 'orders', data: { roles: ['ROLE_MANAGER', 'ROLE_ADMIN'] }, loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES) },
      // { path: 'inventory', loadChildren: () => import('./features/inventory/inventory.routes').then(m => m.INVENTORY_ROUTES) },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];
