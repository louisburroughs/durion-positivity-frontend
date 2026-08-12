import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { NavItem } from '../models/nav-item.model';

const NAV_REGISTRY: NavItem[] = [
  { key: 'SHELL.NAV.DASHBOARD', icon: 'space_dashboard', route: '/app', exact: true, order: 1, group: 'main' },
  { key: 'SHELL.NAV.WORKORDERS', icon: 'construction', route: '/app/workexec', order: 2, group: 'main' },
  { key: 'SHELL.NAV.CRM', icon: 'groups', route: '/app/crm', order: 3, group: 'main' },
  { key: 'SHELL.NAV.DISPATCH', icon: 'storefront', route: '/app/shopmgmt', order: 4, group: 'main' },
  { key: 'SHELL.NAV.ACCOUNTING', icon: 'account_balance', route: '/app/accounting', order: 5, group: 'main' },
  { key: 'SHELL.NAV.BILLING', icon: 'receipt_long', route: '/app/billing', order: 6, group: 'main' },
  { key: 'SHELL.NAV.PEOPLE', icon: 'badge', route: '/app/people', order: 7, group: 'main' },
  { key: 'SHELL.NAV.INVENTORY', icon: 'inventory_2', route: '/app/inventory', order: 8, group: 'main' },
  { key: 'SHELL.NAV.PRODUCT', icon: 'category', route: '/app/product', order: 9, group: 'main' },
  { key: 'SHELL.NAV.LOCATION', icon: 'location_city', route: '/app/location', order: 10, group: 'main' },
  { key: 'SHELL.NAV.SECURITY', icon: 'shield', route: '/app/security', roles: ['ROLE_ADMIN'], order: 11, group: 'admin' },
  { key: 'SHELL.NAV.ADMIN', icon: 'admin_panel_settings', route: '/app/admin', roles: ['ROLE_ADMIN'], order: 12, group: 'admin' },
  { key: 'SHELL.NAV.SITEMAP', icon: 'account_tree', route: '/app/sitemap', roles: ['ROLE_ADMIN'], order: 13, group: 'admin' },
  // Supplier connectivity (positivity domain): vendor profiles, exchange audit,
  // PRICAT sync. Admin-only for now — the Pricing Analyst entry point outside
  // Administration stays closed until the durion#371 precedence policy lands.
  { key: 'SHELL.NAV.SUPPLIER', icon: 'hub', route: '/app/positivity', roles: ['ROLE_ADMIN'], order: 14, group: 'admin' },
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
