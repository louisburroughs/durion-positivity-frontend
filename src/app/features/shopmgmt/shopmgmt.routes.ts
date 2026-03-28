import { Routes } from '@angular/router';
import { ShopmgmtComponent } from './shopmgmt.component';

export const SHOPMGMT_ROUTES: Routes = [
  {
    path: '',
    component: ShopmgmtComponent,
    children: [
      {
        path: 'dispatch-board',
        loadComponent: () =>
          import('./pages/dispatch-board/dispatch-board-page.component').then(
            m => m.DispatchBoardPageComponent,
          ),
      },
      {
        path: 'appointments/new',
        loadComponent: () =>
          import('./pages/appointment-create/appointment-create-page.component').then(
            m => m.AppointmentCreatePageComponent,
          ),
      },
      {
        path: 'appointments/:id/assignments',
        loadComponent: () =>
          import('./pages/appointment-assignment/appointment-assignment-page.component').then(
            m => m.AppointmentAssignmentPageComponent,
          ),
      },
      {
        path: 'appointments/:id/reschedule',
        loadComponent: () =>
          import('./pages/appointment-reschedule/appointment-reschedule-page.component').then(
            m => m.AppointmentReschedulePageComponent,
          ),
      },
    ],
  },
];
