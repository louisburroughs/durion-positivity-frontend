import { Routes } from '@angular/router';
import { OrderComponent } from './order.component';

export const ORDER_ROUTES: Routes = [
  {
    path: '',
    component: OrderComponent,
    children: [
      {
        path: 'cart',
        loadComponent: () =>
          import('./pages/order-cart/order-cart-page.component').then(m => m.OrderCartPageComponent),
      },
      {
        path: 'cart/:orderId',
        loadComponent: () =>
          import('./pages/order-cart/order-cart-page.component').then(m => m.OrderCartPageComponent),
      },
      {
        path: ':orderId/price-override/:lineId',
        loadComponent: () =>
          import('./pages/price-override/price-override-page.component').then(m => m.PriceOverridePageComponent),
      },
      {
        path: ':orderId/cancel',
        loadComponent: () =>
          import('./pages/order-cancel/order-cancel-page.component').then(m => m.OrderCancelPageComponent),
      },
    ],
  },
];
