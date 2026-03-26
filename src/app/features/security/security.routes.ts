import { Routes } from '@angular/router';
import { SecurityComponent } from './security.component';

export const SECURITY_ROUTES: Routes = [
  {
    path: '',
    component: SecurityComponent,
    children: [],
  },
];
