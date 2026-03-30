import { Routes } from '@angular/router';
import { CrmComponent } from './crm.component';

export const CRM_ROUTES: Routes = [
  {
    path: '',
    component: CrmComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/customer-list/customer-list.component').then(
            m => m.CustomerListComponent,
          ),
      },
      {
        path: 'create-commercial-account',
        loadComponent: () =>
          import('./pages/create-commercial-account/create-commercial-account.component').then(
            m => m.CreateCommercialAccountComponent,
          ),
      },
      {
        path: 'create-individual-person',
        loadComponent: () =>
          import('./pages/create-individual-person/create-individual-person.component').then(
            m => m.CreateIndividualPersonComponent,
          ),
      },
      {
        path: 'party/:partyId',
        loadComponent: () =>
          import('./pages/party-detail/party-detail.component').then(
            m => m.PartyDetailComponent,
          ),
      },
      {
        path: 'party/:partyId/add-vehicle',
        loadComponent: () =>
          import('./pages/create-vehicle/create-vehicle.component').then(
            m => m.CreateVehicleComponent,
          ),
      },
      {
        path: 'party/:partyId/contacts',
        loadComponent: () =>
          import('./pages/party-contacts/party-contacts.component').then(
            m => m.PartyContactsComponent,
          ),
      },
      {
        path: 'merge-parties',
        loadComponent: () =>
          import('./pages/merge-parties/merge-parties.component').then(
            m => m.MergePartiesComponent,
          ),
      },
      {
        path: 'snapshot',
        loadComponent: () =>
          import('./pages/crm-snapshot/crm-snapshot.component').then(
            m => m.CrmSnapshotPageComponent,
          ),
      },
      {
        path: 'crm-snapshot/:partyId',
        loadComponent: () =>
          import('./pages/crm-snapshot/crm-snapshot.component').then(
            m => m.CrmSnapshotPageComponent,
          ),
      },
      {
        path: 'integration/events',
        loadComponent: () =>
          import('./pages/integration-events/integration-events-page.component').then(
            m => m.IntegrationEventsPageComponent,
          ),
      },
      {
        path: 'party/:partyId/billing-rules',
        loadComponent: () =>
          import('./pages/billing-rules/billing-rules.component').then(
            m => m.BillingRulesPageComponent,
          ),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
