import { Routes } from '@angular/router';
import { AccountingComponent } from './accounting.component';

export const ACCOUNTING_ROUTES: Routes = [
  {
    path: '',
    component: AccountingComponent,
    children: [],
  },
];
