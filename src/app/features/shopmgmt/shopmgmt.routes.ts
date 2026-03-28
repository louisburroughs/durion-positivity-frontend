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
        path: 'schedule',
        loadComponent: () =>
          import('./pages/schedule-view/schedule-view-page.component').then(
            m => m.ScheduleViewPageComponent,
          ),
      },
      {
        path: 'appointments/new/crm',
        loadComponent: () =>
          import('./pages/appointment-create-crm/appointment-create-crm-page.component').then(
            m => m.AppointmentCreateCrmPageComponent,
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
      {
        path: 'appointments/:id/edit',
        loadComponent: () =>
          import('./pages/appointment-edit/appointment-edit-page.component').then(
            m => m.AppointmentEditPageComponent,
          ),
      },
    ],
  },
];
