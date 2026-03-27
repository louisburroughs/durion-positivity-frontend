import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavItem {
  label: string;
  route: string;
  icon:  string; // Unicode symbol or icon font class
}

/**
 * NavComponent
 * ------------
 * Collapsible left-sidebar navigation.
 * The `collapsed` input is driven by ShellComponent so the parent owns state.
 *
 * Future enhancement: populate navItems dynamically from a permission-aware NavService
 *       once additional domain feature modules are registered.
 */
@Component({
  selector: 'app-shell-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.css',
})
export class NavComponent {
  readonly collapsed = input(false);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',     route: '/app/dashboard',             icon: '⊞' },
    { label: 'Chat',          route: '/chat',                      icon: '💬' },
    { label: 'Dispatch Board', route: '/app/shopmgmt/dispatch-board', icon: '🟦' },
    { label: 'Admin',         route: '/app/admin',                 icon: '🛡️' },
    // Future enhancement: add domain nav items as feature modules are introduced.
    //   { label: 'Orders',    route: '/app/orders',    icon: '🧾' },
    //   { label: 'Inventory', route: '/app/inventory', icon: '📦' },
    //   { label: 'Reports',   route: '/app/reports',   icon: '📊' },
    //   { label: 'Settings',  route: '/app/settings',  icon: '⚙️'  },
  ];
}
