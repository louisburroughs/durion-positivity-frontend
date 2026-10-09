import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../../../core/security/route-access';
import { POSITIVITY_PAGE } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { SupplierProfileService } from '../../services/supplier-profile.service';

type ReadStatus = 'PENDING' | 'OK' | 'FAILED';

let nextId = 0;

/**
 * A vendor's connections — the supplier profiles that belong to it (CAP:550 S30,
 * #469 item 5), read with `GET /v1/supplier/admin/profiles?vendorId=`.
 *
 * The page renders this only with `supplier:profile:read`. Each profile links to
 * its page only when the person can reach that route — the `/app/positivity`
 * group is `ROLE_ADMIN`-gated and the profile page needs `supplier:profile:read`
 * — through the same `canAccess` decision the guard uses; otherwise the name is
 * plain text, never a dead link.
 */
@Component({
  selector: 'app-vendor-connections',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './vendor-connections.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-connections.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorConnectionsComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorId = input.required<string>();

  readonly id = `vendor-connections-${++nextId}`;
  readonly profiles = signal<readonly VendorProfileSummary[]>([]);
  readonly read = signal<ReadStatus>('PENDING');

  private loadSeq = 0;

  /** Both gates of `/app/positivity/profiles/:id`: the group's role and the page's permission. */
  readonly canOpenProfiles = computed(
    () => canAccess(this.auth, { roles: ['ROLE_ADMIN'] }) && canAccess(this.auth, { permissions: POSITIVITY_PAGE.profiles }),
  );

  constructor() {
    effect(() => {
      const vendorId = this.vendorId();
      untracked(() => this.load(vendorId));
    });
  }

  reload(): void {
    this.load(this.vendorId());
  }

  private load(vendorId: string): void {
    const seq = ++this.loadSeq;
    this.read.set('PENDING');
    this.service
      .listProfiles(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profiles => {
          if (seq !== this.loadSeq) return;
          this.profiles.set(profiles);
          this.read.set('OK');
        },
        error: () => {
          if (seq !== this.loadSeq) return;
          this.read.set('FAILED');
        },
      });
  }
}
