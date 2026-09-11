import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { canAccess } from '../../../../core/security/route-access';
import { PlatformTenantService } from '../../services/platform-tenant.service';
import { Tenant, TenantStatus } from '../../models/tenant.models';
import { mapPlatformError } from '../../utils/platform-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden' | 'notFound';

/** The two reversible lifecycle transitions this page offers. */
export type TenantTransition = 'suspend' | 'reactivate';

/**
 * One tenant's registry record with its lifecycle controls (ADR-0062 §7).
 *
 * Suspend (ACTIVE → SUSPENDED, logins refused) and reactivate (SUSPENDED →
 * ACTIVE) are each a two-step action: the first click opens an inline
 * confirmation naming the consequence, the second performs it. Decommission is
 * terminal and deliberately not offered here. A control the session's
 * authorities would not allow is not rendered, so the page never offers an
 * action that can only 403.
 */
@Component({
  selector: 'app-tenant-detail-page',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslatePipe],
  templateUrl: './tenant-detail-page.component.html',
  styleUrls: ['../../platform-shared.css', './tenant-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PlatformTenantService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly tenant = signal<Tenant | null>(null);
  readonly tenantId = signal<string | null>(null);
  /** Transition awaiting confirmation, or null when no confirmation is open. */
  readonly pendingTransition = signal<TenantTransition | null>(null);
  readonly saving = signal(false);
  readonly successKey = signal<string | null>(null);

  readonly canSuspend = computed(
    () =>
      this.tenant()?.status === 'ACTIVE' &&
      canAccess(this.auth, { permissions: ['platform:tenant:suspend'], roles: ['ROLE_PLATFORM_ADMIN'] }),
  );

  readonly canReactivate = computed(
    () =>
      this.tenant()?.status === 'SUSPENDED' &&
      canAccess(this.auth, { permissions: ['platform:tenant:reactivate'], roles: ['ROLE_PLATFORM_ADMIN'] }),
  );

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(params => params.get('id')),
          distinctUntilChanged(),
        )
        .subscribe(id => {
          this.tenantId.set(id);
          this.pendingTransition.set(null);
          this.successKey.set(null);
          if (id) {
            this.load(id);
          }
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  load(id: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getTenant(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tenant => {
          this.tenant.set(tenant);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          const outcome = mapPlatformError(err, 'PLATFORM.TENANTS.ERROR.LOAD_ONE', {
            notFoundKey: 'PLATFORM.TENANTS.ERROR.NOT_FOUND',
          });
          if (outcome.kind === 'forbidden') {
            this.state.set('forbidden');
          } else if (outcome.kind === 'notFound') {
            this.state.set('notFound');
          } else {
            this.state.set('error');
          }
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  reload(): void {
    const id = this.tenantId();
    if (id) {
      this.load(id);
    }
  }

  askConfirmation(transition: TenantTransition): void {
    this.successKey.set(null);
    this.pendingTransition.set(transition);
  }

  cancelTransition(): void {
    this.pendingTransition.set(null);
  }

  confirmTransition(): void {
    const transition = this.pendingTransition();
    const id = this.tenantId();
    if (!transition || !id || this.saving()) return;

    this.saving.set(true);
    this.errorKey.set(null);
    this.successKey.set(null);

    const call$ =
      transition === 'suspend' ? this.service.suspendTenant(id) : this.service.reactivateTenant(id);
    const fallbackKey =
      transition === 'suspend' ? 'PLATFORM.TENANTS.ERROR.SUSPEND' : 'PLATFORM.TENANTS.ERROR.REACTIVATE';
    const successKey =
      transition === 'suspend'
        ? 'PLATFORM.TENANTS.DETAIL.SUSPENDED_SUCCESS'
        : 'PLATFORM.TENANTS.DETAIL.REACTIVATED_SUCCESS';

    call$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: tenant => {
        this.saving.set(false);
        this.pendingTransition.set(null);
        this.tenant.set(tenant);
        this.state.set('ready');
        this.successKey.set(successKey);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.pendingTransition.set(null);
        const outcome = mapPlatformError(err, fallbackKey, {
          conflictKey: 'PLATFORM.TENANTS.ERROR.TRANSITION_CONFLICT',
          notFoundKey: 'PLATFORM.TENANTS.ERROR.NOT_FOUND',
        });
        this.state.set('error');
        this.errorKey.set(outcome.errorKey);
      },
    });
  }

  statusKey(status: TenantStatus): string {
    return `PLATFORM.TENANTS.STATUS.${status}`;
  }

  statusClass(status: TenantStatus): string {
    return `plt-status--${status.toLowerCase()}`;
  }
}
