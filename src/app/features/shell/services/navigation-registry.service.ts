import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { NavItem } from '../models/nav-item.model';

const NAV_REGISTRY: NavItem[] = [
  { key: 'SHELL.NAV.DASHBOARD', icon: 'D', route: '/app', exact: true, order: 1, group: 'main' },
  { key: 'SHELL.NAV.WORKORDERS', icon: 'W', route: '/app/workexec', order: 2, group: 'main' },
  { key: 'SHELL.NAV.CRM', icon: 'C', route: '/app/crm', order: 3, group: 'main' },
  { key: 'SHELL.NAV.DISPATCH', icon: 'S', route: '/app/shopmgmt', order: 4, group: 'main' },
  { key: 'SHELL.NAV.ACCOUNTING', icon: 'A', route: '/app/accounting', order: 5, group: 'main' },
  { key: 'SHELL.NAV.BILLING', icon: 'B', route: '/app/billing', order: 6, group: 'main' },
  { key: 'SHELL.NAV.PEOPLE', icon: 'P', route: '/app/people', order: 7, group: 'main' },
  { key: 'SHELL.NAV.INVENTORY', icon: 'I', route: '/app/inventory', order: 8, group: 'main' },
  { key: 'SHELL.NAV.LOCATION', icon: 'L', route: '/app/location', order: 9, group: 'main' },
  { key: 'SHELL.NAV.SECURITY', icon: 'S', route: '/app/security', roles: ['ROLE_ADMIN'], order: 10, group: 'admin' },
  { key: 'SHELL.NAV.ADMIN', icon: 'Ad', route: '/app/admin', roles: ['ROLE_ADMIN'], order: 11, group: 'admin' },
];

@Injectable({ providedIn: 'root' })
export class NavigationRegistryService {
  private readonly authService = inject(AuthService);

  readonly visibleNavItems = computed<NavItem[]>(() => {
    return NAV_REGISTRY.filter(
      item => !item.roles || this.authService.hasAnyRole(item.roles),
    );
  });
}
