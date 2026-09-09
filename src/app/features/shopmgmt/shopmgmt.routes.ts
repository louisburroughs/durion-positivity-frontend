import { Routes } from '@angular/router';
import { SHOPMGMT_PAGE } from '../../core/security/route-permissions';
import { ShopmgmtComponent } from './shopmgmt.component';

/**
 * Pages declare the permission their primary read needs (`SHOPMGMT_PAGE`), on top of
 * the group gate `/app/shopmgmt` already carries. `rolesChildGuard` runs at every
 * level, so both must pass. See `core/security/route-permissions.ts` for how
 * each code was traced to the backend controller that enforces it.
 */
export const SHOPMGMT_ROUTES: Routes = [
  {
    path: '',
    component: ShopmgmtComponent,
    children: [
      // ── Landing page ───────────────────────────────────────────────────────
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/shopmgmt-landing-page.component').then(
            m => m.ShopmgmtLandingPageComponent,
          ),
      },

      {
        path: 'shop-dashboard',
        data: { permissions: SHOPMGMT_PAGE.dashboard },
        loadComponent: () =>
          import('./pages/shop-dashboard/shop-dashboard-page.component').then(
            m => m.ShopDashboardPageComponent,
          ),
      },
      {
        path: 'dispatch-board',
        data: { permissions: SHOPMGMT_PAGE.dashboard },
        loadComponent: () =>
          import('./pages/dispatch-board/dispatch-board-page.component').then(
            m => m.DispatchBoardPageComponent,
          ),
      },
      {
        path: 'schedule',
        data: { permissions: SHOPMGMT_PAGE.schedule },
        loadComponent: () =>
          import('./pages/schedule-view/schedule-view-page.component').then(
            m => m.ScheduleViewPageComponent,
          ),
      },
      {
        path: 'appointments/new/crm',
        data: { permissions: SHOPMGMT_PAGE.appointmentCreate },
        loadComponent: () =>
          import('./pages/appointment-create-crm/appointment-create-crm-page.component').then(
            m => m.AppointmentCreateCrmPageComponent,
          ),
      },
      {
        path: 'appointments/new',
        data: { permissions: SHOPMGMT_PAGE.appointmentCreate },
        loadComponent: () =>
          import('./pages/appointment-create/appointment-create-page.component').then(
            m => m.AppointmentCreatePageComponent,
          ),
      },
      {
        path: 'appointments/:id/assignments',
        data: { permissions: SHOPMGMT_PAGE.appointmentView },
        loadComponent: () =>
          import('./pages/appointment-assignment/appointment-assignment-page.component').then(
            m => m.AppointmentAssignmentPageComponent,
          ),
      },
      {
        path: 'appointments/:id/reschedule',
        data: { permissions: SHOPMGMT_PAGE.appointmentReschedule },
        loadComponent: () =>
          import('./pages/appointment-reschedule/appointment-reschedule-page.component').then(
            m => m.AppointmentReschedulePageComponent,
          ),
      },
      {
        path: 'appointments/:id/edit',
        data: { permissions: SHOPMGMT_PAGE.appointmentView },
        loadComponent: () =>
          import('./pages/appointment-edit/appointment-edit-page.component').then(
            m => m.AppointmentEditPageComponent,
          ),
      },
      {
        path: 'appointments/:id/override-conflict',
        data: { permissions: SHOPMGMT_PAGE.appointmentOverride },
        loadComponent: () =>
          import('./pages/appointment-conflict-override/appointment-conflict-override-page.component').then(
            m => m.AppointmentConflictOverridePageComponent,
          ),
      },
      {
        path: 'appointments/:id/dispatch-assign',
        data: { permissions: SHOPMGMT_PAGE.bayAssign },
        loadComponent: () =>
          import('./pages/appointment-dispatch-assign/appointment-dispatch-assign-page.component').then(
            m => m.AppointmentDispatchAssignPageComponent,
          ),
      },
      {
        path: 'mechanics/availability',
        data: { permissions: SHOPMGMT_PAGE.mechanicAvailability },
        loadComponent: () =>
          import('./pages/mechanic-availability/mechanic-availability-page.component').then(
            m => m.MechanicAvailabilityPageComponent,
          ),
      },
      {
        path: 'mechanics/roster',
        data: { permissions: SHOPMGMT_PAGE.mechanicRoster },
        loadComponent: () =>
          import('./pages/mechanic-roster/mechanic-roster-page.component').then(
            m => m.MechanicRosterPageComponent,
          ),
      },
    ],
  },
];
