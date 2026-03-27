import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SecurityPermission, SecurityRole } from '../../../models/security.models';
import { SecurityService } from '../../../services/security.service';

@Component({
  selector: 'app-role-detail-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './role-detail-page.component.html',
  styleUrl: './role-detail-page.component.css',
})
export class RoleDetailPageComponent implements OnInit {
  private readonly securityService = inject(SecurityService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly role = signal<SecurityRole | null>(null);
  readonly permissions = signal<SecurityPermission[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showGrantModal = signal(false);
  readonly selectedPermKeys = signal<string[]>([]);
  readonly allPermissions = signal<SecurityPermission[]>([]);
  readonly confirmRevokeKey = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRole();
    this.loadAllPermissions();
  }

  loadRole(): void {
    const roleName = this.route.snapshot.paramMap.get('name');
    if (!roleName) {
      this.error.set('Role name was not provided.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.securityService
      .getRoleByName(roleName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (role) => {
          this.role.set(role);
          this.permissions.set(role.grantedPermissions ?? []);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.role.set(null);
          this.permissions.set([]);
          this.confirmRevokeKey.set(null);
          this.error.set(err?.error?.message ?? 'Failed to load role details.');
        },
      });
  }

  loadAllPermissions(): void {
    this.securityService
      .getAllPermissions(0, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.allPermissions.set(resp.results ?? []);
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Failed to load permissions.');
        },
      });
  }

  openGrantModal(): void {
    this.showGrantModal.set(true);
    this.selectedPermKeys.set(this.permissions().map((permission) => permission.permissionKey));
  }

  togglePermission(key: string): void {
    if (this.selectedPermKeys().includes(key)) {
      this.selectedPermKeys.update(keys => keys.filter(item => item !== key));
      return;
    }

    this.selectedPermKeys.update(keys => [...keys, key]);
  }

  submitGrantPermissions(): void {
    const currentRole = this.role();
    if (!currentRole) {
      return;
    }

    this.loading.set(true);
    this.securityService
      .updateRolePermissions({
        roleName: currentRole.name,
        permissionKeys: this.selectedPermKeys(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showGrantModal.set(false);
          this.loading.set(false);
          this.loadRole();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Failed to update role permissions.');
        },
      });
  }

  confirmRevoke(permissionKey: string): void {
    this.confirmRevokeKey.set(permissionKey);
  }

  cancelRevoke(): void {
    this.confirmRevokeKey.set(null);
  }

  executeRevoke(): void {
    const keyToRemove = this.confirmRevokeKey();
    const currentRole = this.role();
    if (!keyToRemove || !currentRole) {
      return;
    }

    const updatedKeys = this.permissions()
      .map((p) => p.permissionKey)
      .filter((k) => k !== keyToRemove);

    this.loading.set(true);
    this.securityService
      .updateRolePermissions({ roleName: currentRole.name, permissionKeys: updatedKeys })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmRevokeKey.set(null);
          this.loading.set(false);
          this.loadRole();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Failed to revoke permission.');
        },
      });
  }
}
