import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

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
    path: 'app',
    loadComponent: () =>
      import('./features/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shell/dashboard/dashboard.component').then(
            m => m.DashboardComponent,
          ),
      },
      // TODO: Register lazy-loaded domain feature routes here, e.g.:
      // { path: 'orders',    loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES) },
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
    redirectTo: 'app',
  },
];
