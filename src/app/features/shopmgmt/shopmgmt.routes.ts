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
    ],
  },
];
