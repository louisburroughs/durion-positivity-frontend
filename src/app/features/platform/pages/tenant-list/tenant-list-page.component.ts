import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { canAccess } from '../../../../core/security/route-access';
import { PLATFORM_PAGE } from '../../../../core/security/route-permissions';
import { PlatformTenantService } from '../../services/platform-tenant.service';
import { TENANT_STATUSES, Tenant, TenantStatus } from '../../models/tenant.models';
import { mapPlatformError } from '../../utils/platform-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Tenant registry list (ADR-0062 §7): every tenant on the platform, with an
 * optional lifecycle-status filter. Registering a tenant and moving one
 * through its lifecycle happen on the create and detail pages.
 */
@Component({
  selector: 'app-tenant-list-page',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslatePipe],
  templateUrl: './tenant-list-page.component.html',
  styleUrls: ['../../platform-shared.css', './tenant-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantListPageComponent {
  private readonly service = inject(PlatformTenantService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly tenants = signal<Tenant[]>([]);
  readonly statusFilter = signal<TenantStatus | ''>('');

  readonly statuses = TENANT_STATUSES;

  /** The route gate for `tenants/new`, so the button is never a dead end. */
  readonly canCreate = computed(() =>
    canAccess(this.auth, { permissions: PLATFORM_PAGE.tenantCreate, roles: ['ROLE_PLATFORM_ADMIN'] }),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    const status = this.statusFilter() || undefined;
    this.service
      .listTenants(status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tenants => {
          this.tenants.set(tenants);
          this.state.set(tenants.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapPlatformError(err, 'PLATFORM.TENANTS.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter.set(this.isTenantStatus(value) ? value : '');
    this.load();
  }

  statusKey(status: TenantStatus): string {
    return `PLATFORM.TENANTS.STATUS.${status}`;
  }

  statusClass(status: TenantStatus): string {
    return `plt-status--${status.toLowerCase()}`;
  }

  private isTenantStatus(value: string): value is TenantStatus {
    return (TENANT_STATUSES as readonly string[]).includes(value);
  }
}
