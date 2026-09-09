import { Routes } from '@angular/router';
import { ORDER_PAGE } from '../../core/security/route-permissions';
import { OrderComponent } from './order.component';

/**
 * Pages declare the permission their primary read needs (`ORDER_PAGE`), on top of
 * the group gate `/app/order` already carries. `rolesChildGuard` runs at every
 * level, so both must pass. See `core/security/route-permissions.ts` for how
 * each code was traced to the backend controller that enforces it.
 */
export const ORDER_ROUTES: Routes = [
  {
    path: '',
    component: OrderComponent,
    children: [
      {
        path: 'cart',
        data: { permissions: ORDER_PAGE.cartCreate },
        loadComponent: () =>
          import('./pages/order-cart/order-cart-page.component').then(m => m.OrderCartPageComponent),
      },
      {
        path: 'cart/:orderId',
        data: { permissions: ORDER_PAGE.cartView },
        loadComponent: () =>
          import('./pages/order-cart/order-cart-page.component').then(m => m.OrderCartPageComponent),
      },
      {
        path: ':orderId/price-override/:lineId',
        data: { permissions: ORDER_PAGE.priceOverride },
        loadComponent: () =>
          import('./pages/price-override/price-override-page.component').then(m => m.PriceOverridePageComponent),
      },
      {
        path: ':orderId/cancel',
        data: { permissions: ORDER_PAGE.cancel },
        loadComponent: () =>
          import('./pages/order-cancel/order-cancel-page.component').then(m => m.OrderCancelPageComponent),
      },
    ],
  },
];
