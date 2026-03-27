import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SecurityPermission } from '../../../models/security.models';
import { SecurityService } from '../../../services/security.service';

@Component({
  selector: 'app-permissions-list-page',
  standalone: true,
  templateUrl: './permissions-list-page.component.html',
  styleUrl: './permissions-list-page.component.css',
})
export class PermissionsListPageComponent implements OnInit {
  private readonly securityService = inject(SecurityService);
  private readonly destroyRef = inject(DestroyRef);

  readonly permissions = signal<SecurityPermission[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(0);
  readonly totalPages = signal(0);

  ngOnInit(): void {
    this.loadPermissions();
  }

  loadPermissions(): void {
    this.loading.set(true);
    this.error.set(null);

    this.securityService
      .getAllPermissions(this.page(), 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          const term = this.searchTerm().trim().toLowerCase();
          const results = resp.results ?? [];

          this.permissions.set(
            term.length > 0
              ? results.filter(permission => permission.permissionKey.toLowerCase().includes(term))
              : results,
          );
          this.totalPages.set(resp.totalPages ?? 0);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Failed to load permissions.');
        },
      });
  }

  search(): void {
    this.page.set(0);
    this.loadPermissions();
  }

  nextPage(): void {
    if (this.page() + 1 >= this.totalPages()) {
      return;
    }

    this.page.update(p => p + 1);
    this.loadPermissions();
  }

  prevPage(): void {
    if (this.page() <= 0) {
      return;
    }

    this.page.update(p => p - 1);
    this.loadPermissions();
  }
}
