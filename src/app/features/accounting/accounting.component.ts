import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../core/security/route-access';
import { AuthService } from '../../core/services/auth.service';
import { ACCOUNTING_SUBNAV, AccountingSubnavEntry } from './accounting-subnav';
import { AccountingPreferencesService } from './services/accounting-preferences.service';

/** Where the feature is mounted (`app.routes.ts`). */
const ACCOUNTING_BASE = '/app/accounting';

/**
 * The accounting workspace's shared chrome (SPEC-accounting-workspace §5.0):
 * the accounting sub-navigation, the **Show accounting terms** switch and the
 * outlet every accounting page renders into.
 *
 * The sub-navigation lists only the {@link ACCOUNTING_SUBNAV} entries the
 * session can open, through the same `canAccess` decision the route guard
 * uses; a token without `perm_bits` falls back to showing every entry, as the
 * guard does. The current entry carries `aria-current="page"`.
 */
@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingComponent {
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(AccountingPreferencesService);

  /** Re-evaluated on a token refresh: `canAccess` reads the auth signals. */
  readonly visibleEntries = computed(() =>
    ACCOUNTING_SUBNAV.filter(entry => canAccess(this.auth, { permissions: entry.permissions })),
  );

  readonly showTerms = this.preferences.showTerms;

  link(entry: AccountingSubnavEntry): string {
    return entry.route ? `${ACCOUNTING_BASE}/${entry.route}` : ACCOUNTING_BASE;
  }

  onShowTermsChange(event: Event): void {
    this.preferences.setShowTerms((event.target as HTMLInputElement).checked);
  }
}
