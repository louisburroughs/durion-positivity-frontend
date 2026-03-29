import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SecurityRole } from '../../../models/security.models';
import { SecurityService } from '../../../services/security.service';

@Component({
  selector: 'app-roles-list-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './roles-list-page.component.html',
  styleUrl: './roles-list-page.component.css',
})
export class RolesListPageComponent implements OnInit {
  private readonly securityService = inject(SecurityService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly roles = signal<SecurityRole[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly showCreateModal = signal(false);
  readonly newRoleName = signal('');
  readonly newRoleDescription = signal('');
  readonly createError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    this.loading.set(true);
    this.error.set(null);

    this.securityService
      .getAllRoles(this.page(), 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          const term = this.searchTerm().trim().toLowerCase();
          const results = resp.results ?? [];
          const hasSearch = term.length > 0;
          const filtered = hasSearch
            ? results.filter(role => role.name.toLowerCase().includes(term))
            : results;
          this.roles.set(filtered);
          const searchPages = filtered.length > 0 ? 1 : 0;
          this.totalPages.set(hasSearch ? searchPages : (resp.totalPages ?? 0));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.roles.set([]);
          this.totalPages.set(0);
          this.error.set(err?.error?.message ?? 'SECURITY.ROLES_LIST.ERROR.LOAD');
        },
      });
  }

  search(): void {
    this.page.set(0);
    this.loadRoles();
  }

  nextPage(): void {
    if (this.page() + 1 >= this.totalPages()) {
      return;
    }

    this.page.update(p => p + 1);
    this.loadRoles();
  }

  prevPage(): void {
    if (this.page() <= 0) {
      return;
    }

    this.page.update(p => p - 1);
    this.loadRoles();
  }

  openCreateModal(): void {
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.newRoleName.set('');
    this.newRoleDescription.set('');
    this.createError.set(null);
  }

  submitCreate(): void {
    const name = this.newRoleName().trim();
    const description = this.newRoleDescription().trim();

    if (!name) {
      this.createError.set('SECURITY.ROLES_LIST.ERROR.NAME_REQUIRED');
      return;
    }

    this.createError.set(null);
    this.securityService
      .createRole({
        name,
        description: description || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeCreateModal();
          this.loadRoles();
        },
        error: (err) => {
          this.createError.set(err?.error?.message ?? 'SECURITY.ROLES_LIST.ERROR.CREATE');
        },
      });
  }

  navigateToDetail(role: SecurityRole): void {
    this.router.navigate(['/app/security/roles', role.name]);
  }
}
