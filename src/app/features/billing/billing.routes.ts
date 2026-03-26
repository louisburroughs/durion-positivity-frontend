import { Routes } from '@angular/router';
import { BillingComponent } from './billing.component';

export const BILLING_ROUTES: Routes = [
  {
    path: '',
    component: BillingComponent,
    children: [],
  },
];
