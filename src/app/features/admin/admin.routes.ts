import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/landing/admin-landing-page.component').then(
        m => m.AdminLandingPageComponent,
      ),
  },
];
