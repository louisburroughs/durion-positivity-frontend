import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStateService } from '../services/chat-state.service';
import { ChatApiService } from '../services/chat-api.service';

/** Visual tone for a quick-action tile; maps to a CSS class. */
type ActionTone = 'teal' | 'blue' | 'info' | 'gold' | 'error';

interface QuickAction {
  readonly icon: string;
  readonly labelKey: string;
  readonly subKey: string;
  readonly route: string;
  readonly tone: ActionTone;
}

interface RecentItem {
  readonly icon: string;
  readonly labelKey: string;
  readonly metaKey: string;
  readonly route: string;
}

interface FavoriteArea {
  readonly icon: string;
  readonly labelKey: string;
  readonly route: string;
}

/**
 * DashboardComponent
 * ------------------
 * Authenticated home page rendered in the content panel at `/app`.
 *
 * Data is intentionally static config for this iteration (no backend endpoint
 * exists for pins/recents/favorites). The assistant strip forwards into the
 * shared {@link ChatStateService}, so messages surface in the always-visible
 * shell chat panel.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly chatState = inject(ChatStateService);
  private readonly chatApi = inject(ChatApiService);
  private readonly translate = inject(TranslateService);

  /** First name derived from the JWT `sub` claim, or null when unresolved. */
  readonly firstName = computed<string | null>(() => {
    const sub = this.auth.currentUserClaims()?.sub?.trim();
    if (!sub) return null;
    const segment = sub.split(/[.@]/).filter(Boolean).pop() ?? sub;
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  });

  readonly assistantInput = signal('');
  readonly assistantSending = signal(false);

  readonly quickActions: readonly QuickAction[] = [
    { icon: 'assignment_add', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.NEW_WORKORDER', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.NEW_WORKORDER_SUB', route: '/app/workexec', tone: 'teal' },
    { icon: 'person_add', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.ADD_CUSTOMER', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.ADD_CUSTOMER_SUB', route: '/app/crm', tone: 'blue' },
    { icon: 'payments', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.TAKE_PAYMENT', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.TAKE_PAYMENT_SUB', route: '/app/billing', tone: 'info' },
    { icon: 'event', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.SCHEDULE', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.SCHEDULE_SUB', route: '/app/shopmgmt', tone: 'gold' },
    { icon: 'inventory_2', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.LOW_STOCK', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.LOW_STOCK_SUB', route: '/app/inventory', tone: 'error' },
  ];

  readonly recentItems: readonly RecentItem[] = [
    { icon: 'construction', labelKey: 'SHELL.NAV.WORKORDERS', metaKey: 'SHELL.DASHBOARD.RECENT.WORKORDERS_META', route: '/app/workexec' },
    { icon: 'groups', labelKey: 'SHELL.NAV.CRM', metaKey: 'SHELL.DASHBOARD.RECENT.CRM_META', route: '/app/crm' },
    { icon: 'receipt_long', labelKey: 'SHELL.NAV.BILLING', metaKey: 'SHELL.DASHBOARD.RECENT.BILLING_META', route: '/app/billing' },
    { icon: 'inventory_2', labelKey: 'SHELL.NAV.INVENTORY', metaKey: 'SHELL.DASHBOARD.RECENT.INVENTORY_META', route: '/app/inventory' },
  ];

  readonly favoriteAreas: readonly FavoriteArea[] = [
    { icon: 'construction', labelKey: 'SHELL.NAV.WORKORDERS', route: '/app/workexec' },
    { icon: 'account_balance', labelKey: 'SHELL.NAV.ACCOUNTING', route: '/app/accounting' },
    { icon: 'inventory_2', labelKey: 'SHELL.NAV.INVENTORY', route: '/app/inventory' },
    { icon: 'storefront', labelKey: 'SHELL.NAV.DISPATCH', route: '/app/shopmgmt' },
  ];

  /** Forward the assistant-strip text into the shared chat panel. */
  submitAssistant(): void {
    const text = this.assistantInput().trim();
    if (!text || this.assistantSending()) return;

    this.chatState.addUserMessage(text);
    this.assistantInput.set('');
    this.assistantSending.set(true);

    this.chatApi
      .sendMessage({ message: text })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.assistantSending.set(false)),
      )
      .subscribe({
        next: resp => this.chatState.addSystemMessage(resp.response),
        error: () => this.chatState.addSystemMessage(this.translate.instant('SHELL.CHAT.ERROR_BACKEND')),
      });
  }

  onAssistantKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitAssistant();
    }
  }

  /** Placeholder for the future pin-customization flow (ADR-tracked, not built yet). */
  onCustomize(): void {
    // Intentionally a no-op this iteration; the control is present for layout parity.
  }
}
