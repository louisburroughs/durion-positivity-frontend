import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../../shared/material-symbol.pipe';
import { ChatSendService } from '../services/chat-send.service';
import { ChatUiService } from '../services/chat-ui.service';
import { recordOperation } from '../../../core/observability/operation-telemetry';

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
  imports: [FormsModule, RouterLink, TranslatePipe, MaterialSymbolPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly chatSend = inject(ChatSendService);
  private readonly chatUi = inject(ChatUiService);

  constructor() {
    // Static page (no async data load) — outcome is 'success' as soon as it
    // constructs/renders. See operations.yaml `view-operations-dashboard` and
    // docs/observability/plan.md 5.2 (durion-positivity-backend repo).
    recordOperation({
      name: 'View Operations Dashboard',
      type: 'ui_view',
      outcome: 'success',
    });
  }

  /** First name derived from the JWT `sub` claim, or null when unresolved.
   *  Uses the FIRST token of an email/dotted id (e.g. `jane.doe@durion.com` → `Jane`). */
  readonly firstName = computed<string | null>(() => {
    const sub = this.auth.currentUserClaims()?.sub?.trim();
    if (!sub) return null;
    const segment = sub.split(/[.@]/).filter(Boolean)[0] ?? sub;
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  });

  readonly assistantInput = signal('');
  readonly assistantSending = signal(false);

  readonly quickActions: readonly QuickAction[] = [
    { icon: 'assignment_add', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.NEW_WORKORDER', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.NEW_WORKORDER_SUB', route: '/app/workexec', tone: 'teal' },
    { icon: 'person_add', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.ADD_CUSTOMER', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.ADD_CUSTOMER_SUB', route: '/app/crm', tone: 'blue' },
    { icon: 'payments', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.TAKE_PAYMENT', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.TAKE_PAYMENT_SUB', route: '/app/billing', tone: 'info' },
    { icon: 'event', labelKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.SCHEDULE', subKey: 'SHELL.DASHBOARD.QUICK_ACTIONS.SCHEDULE_SUB', route: '/app/shopmgmt/schedule', tone: 'gold' },
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
    { icon: 'badge', labelKey: 'SHELL.NAV.PEOPLE', route: '/app/people' },
  ];

  /** Forward the assistant-strip text into the shared chat panel.
   *  Deliberately NOT tied to this component's lifecycle: the reply is written
   *  to the root ChatStateService consumed by the always-visible shell chat
   *  panel, so it must still land if a quick-action navigates away mid-request. */
  submitAssistant(): void {
    const text = this.assistantInput().trim();
    if (!text || this.assistantSending()) return;

    this.assistantInput.set('');
    this.assistantSending.set(true);
    this.chatUi.open(); // surface the conversation in the shell chat panel

    this.chatSend.send(text, {
      onSettled: () => this.assistantSending.set(false),
    });
  }

  onAssistantKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitAssistant();
    }
  }
}
