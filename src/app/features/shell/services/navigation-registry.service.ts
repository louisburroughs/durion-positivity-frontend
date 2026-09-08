import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { canAccess } from '../../../core/security/route-access';
import {
  ACCOUNTING_PERMISSIONS,
  BILLING_PERMISSIONS,
  CRM_PERMISSIONS,
  INVENTORY_PERMISSIONS,
  LOCATION_PERMISSIONS,
  PEOPLE_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  SHOPMGMT_PERMISSIONS,
  WORKEXEC_PERMISSIONS,
} from '../../../core/security/route-permissions';
import { NavItem } from '../models/nav-item.model';

/**
 * Nav entries carry the same access requirement as the route they point at
 * (`app.routes.ts`), evaluated through the shared `canAccess` decision. Gating a
 * route without also filtering the nav just moves the dead end — the entry has
 * to stop being offered.
 */

/** Exported for the nav/route consistency spec; use `visibleNavItems` at runtime. */
export const NAV_REGISTRY: NavItem[] = [
  { key: 'SHELL.NAV.DASHBOARD', icon: 'space_dashboard', route: '/app', exact: true, order: 1, group: 'main' },
  { key: 'SHELL.NAV.WORKORDERS', icon: 'construction', route: '/app/workexec', permissions: WORKEXEC_PERMISSIONS, order: 2, group: 'main' },
  { key: 'SHELL.NAV.CRM', icon: 'groups', route: '/app/crm', permissions: CRM_PERMISSIONS, order: 3, group: 'main' },
  { key: 'SHELL.NAV.DISPATCH', icon: 'storefront', route: '/app/shopmgmt', permissions: SHOPMGMT_PERMISSIONS, order: 4, group: 'main' },
  { key: 'SHELL.NAV.ACCOUNTING', icon: 'account_balance', route: '/app/accounting', permissions: ACCOUNTING_PERMISSIONS, order: 5, group: 'main' },
  { key: 'SHELL.NAV.BILLING', icon: 'receipt_long', route: '/app/billing', permissions: BILLING_PERMISSIONS, order: 6, group: 'main' },
  { key: 'SHELL.NAV.PEOPLE', icon: 'badge', route: '/app/people', permissions: PEOPLE_PERMISSIONS, order: 7, group: 'main' },
  { key: 'SHELL.NAV.INVENTORY', icon: 'inventory_2', route: '/app/inventory', permissions: INVENTORY_PERMISSIONS, order: 8, group: 'main' },
  { key: 'SHELL.NAV.PRODUCT', icon: 'category', route: '/app/product', permissions: PRODUCT_PERMISSIONS, order: 9, group: 'main' },
  { key: 'SHELL.NAV.LOCATION', icon: 'location_city', route: '/app/location', permissions: LOCATION_PERMISSIONS, order: 10, group: 'main' },
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

  readonly visibleNavItems = computed<NavItem[]>(() =>
    NAV_REGISTRY.filter(item =>
      canAccess(this.authService, { roles: item.roles, permissions: item.permissions }),
    ),
  );
}
