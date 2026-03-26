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
      { path: '**', redirectTo: '' },
    ],
  },
];
