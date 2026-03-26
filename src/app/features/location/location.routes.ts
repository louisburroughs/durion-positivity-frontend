import { Routes } from '@angular/router';
import { LocationComponent } from './location.component';

export const LOCATION_ROUTES: Routes = [
  {
    path: '',
    component: LocationComponent,
    children: [],
  },
];
