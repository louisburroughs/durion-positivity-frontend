import { Routes } from '@angular/router';
import { PeopleComponent } from './people.component';

export const PEOPLE_ROUTES: Routes = [
  {
    path: '',
    component: PeopleComponent,
    children: [],
  },
];
