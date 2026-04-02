import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../../core/services/auth.service';
import { InventoryPermissionEntry } from '../../../models/inventory.models';
import { SecurityPermission } from '../../../../security/models/security.models';
import { SecurityService } from '../../../../security/services/security.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

const INVENTORY_PERMISSION_FALLBACK: Array<Pick<InventoryPermissionEntry, 'permissionKey' | 'description' | 'category'>> = [
  {
    permissionKey: 'INVENTORY.VIEW',
    description: 'INVENTORY.SECURITY.PERMISSION.VIEW.DESC',
    category: 'inventory',
  },
  {
    permissionKey: 'INVENTORY.ADJUST',
    description: 'INVENTORY.SECURITY.PERMISSION.ADJUST.DESC',
    category: 'inventory',
  },
  {
    permissionKey: 'INVENTORY.TRANSFER',
    description: 'INVENTORY.SECURITY.PERMISSION.TRANSFER.DESC',
    category: 'inventory',
  },
  {
    permissionKey: 'INVENTORY.SECURITY.ADMIN',
    description: 'INVENTORY.SECURITY.PERMISSION.ADMIN.DESC',
    category: 'inventory',
  },
];

@Component({
  selector: 'app-inventory-security-admin-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './inventory-security-admin-page.component.html',
  styleUrls: ['./inventory-security-admin-page.component.css'],
})
export class InventorySecurityAdminPageComponent {
  private readonly securityService = inject(SecurityService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly permissions = signal<InventoryPermissionEntry[]>([]);
  readonly filterQuery = signal('');

  readonly filteredPermissions = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    if (!query) {
      return this.permissions();
    }

    return this.permissions().filter(permission =>
      permission.permissionKey.toLowerCase().includes(query),
    );
  });

  constructor() {
    this.loadPermissions();
  }

  setFilterQuery(query: string): void {
    this.filterQuery.set(query);
  }

  private loadPermissions(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.securityService
      .getAllPermissions(0, 500)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          const inventoryPermissions = (response.results ?? []).filter(permission =>
            permission.permissionKey.toLowerCase().includes('inventory'),
          );

          if (inventoryPermissions.length > 0) {
            this.permissions.set(this.toInventoryEntries(inventoryPermissions));
          } else {
            this.permissions.set(this.deriveFallbackPermissions());
          }

          this.state.set('ready');
        },
        error: err => {
          if (err?.status === 403) {
            this.state.set('error');
            this.errorKey.set('INVENTORY.SECURITY.PERMISSIONS.ERROR.FORBIDDEN');
            return;
          }

          this.state.set('error');
          this.errorKey.set('INVENTORY.SECURITY.PERMISSIONS.ERROR.LOAD');
        },
      });
  }

  private toInventoryEntries(permissions: SecurityPermission[]): InventoryPermissionEntry[] {
    const authorities = this.currentAuthorities();

    return permissions.map(permission => ({
      permissionKey: permission.permissionKey,
      description:
        permission.description ||
        this.getPermissionDescriptionKey(permission.permissionKey),
      category: this.getCategory(permission.permissionKey),
      isCurrentUserGranted: authorities.has(permission.permissionKey),
    }));
  }

  private deriveFallbackPermissions(): InventoryPermissionEntry[] {
    const authorities = this.currentAuthorities();

    return INVENTORY_PERMISSION_FALLBACK.map(permission => ({
      ...permission,
      isCurrentUserGranted: authorities.has(permission.permissionKey),
    }));
  }

  private currentAuthorities(): Set<string> {
    const claims = this.authService.currentUserClaims();
    const authorities = new Set<string>();

    (claims?.authorities ?? []).forEach(authority => authorities.add(authority));
    (claims?.roles ?? []).forEach(role => authorities.add(role));

    return authorities;
  }

  private getCategory(permissionKey: string): string {
    const category = permissionKey.split('.')[0]?.toLowerCase();
    return category || 'inventory';
  }

  private getPermissionDescriptionKey(permissionKey: string): string {
    const suffix = permissionKey.split('.').at(-1)?.toUpperCase();
    if (!suffix) {
      return 'COMMON.EMPTY_VALUE';
    }
    return `INVENTORY.SECURITY.PERMISSION.${suffix}.DESC`;
  }
}
