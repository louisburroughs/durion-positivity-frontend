import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'ledgerEntryId'
  | 'putawayTaskId'
  | 'poId'
  | 'poEditId'
  | 'workorderPickListId'
  | 'workorderPickExecuteId'
  | 'workorderReturnId'
  | 'workorderConsumeId'
  | 'workorderShortageId';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

interface DirectCard {
  readonly kind: 'direct';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly routeLabel: string;
  readonly routerLink: string[];
}

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly routeLabel: string;
  readonly field: LaunchField;
  readonly fieldLabelKey: string;
  readonly placeholderKey: string;
  readonly actionKey: string;
  readonly buildCommands: (value: string) => string[];
}

type LandingCard = DirectCard | LaunchCard;

interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly cards: readonly LandingCard[];
}

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'INVENTORY.LANDING.SECTION.STOCK.TITLE',
    descriptionKey: 'INVENTORY.LANDING.SECTION.STOCK.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.AVAILABILITY.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.AVAILABILITY.DESCRIPTION',
        routeLabel: 'availability',
        routerLink: ['/app', 'inventory', 'availability'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.LEDGER.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.LEDGER.DESCRIPTION',
        routeLabel: 'ledger',
        routerLink: ['/app', 'inventory', 'ledger'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.LEDGER_ENTRY.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.LEDGER_ENTRY.DESCRIPTION',
        routeLabel: 'ledger/:ledgerEntryId',
        field: 'ledgerEntryId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.LEDGER_ENTRY_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.LEDGER_ENTRY_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_LEDGER_ENTRY',
        buildCommands: (v) => ['/app', 'inventory', 'ledger', v],
      },
    ],
  },
  {
    titleKey: 'INVENTORY.LANDING.SECTION.RECEIVING.TITLE',
    descriptionKey: 'INVENTORY.LANDING.SECTION.RECEIVING.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.RECEIVE_INTO_STAGING.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.RECEIVE_INTO_STAGING.DESCRIPTION',
        routeLabel: 'receiving/receive-into-staging',
        routerLink: ['/app', 'inventory', 'receiving', 'receive-into-staging'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.CROSS_DOCK.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.CROSS_DOCK.DESCRIPTION',
        routeLabel: 'receiving/cross-dock',
        routerLink: ['/app', 'inventory', 'receiving', 'cross-dock'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASKS.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASKS.DESCRIPTION',
        routeLabel: 'putaway/tasks',
        routerLink: ['/app', 'inventory', 'putaway', 'tasks'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASK.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASK.DESCRIPTION',
        routeLabel: 'putaway/tasks/:taskId',
        field: 'putawayTaskId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.PUTAWAY_TASK_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.PUTAWAY_TASK_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_PUTAWAY_TASK',
        buildCommands: (v) => ['/app', 'inventory', 'putaway', 'tasks', v],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.REPLENISHMENT.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.REPLENISHMENT.DESCRIPTION',
        routeLabel: 'replenishment/tasks',
        routerLink: ['/app', 'inventory', 'replenishment', 'tasks'],
      },
    ],
  },
  {
    titleKey: 'INVENTORY.LANDING.SECTION.COUNTS.TITLE',
    descriptionKey: 'INVENTORY.LANDING.SECTION.COUNTS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.COUNT_EXECUTE.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_EXECUTE.DESCRIPTION',
        routeLabel: 'counts/execute',
        routerLink: ['/app', 'inventory', 'counts', 'execute'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.COUNT_ADJUSTMENTS.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_ADJUSTMENTS.DESCRIPTION',
        routeLabel: 'counts/adjustments',
        routerLink: ['/app', 'inventory', 'counts', 'adjustments'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.COUNT_PLANS.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_PLANS.DESCRIPTION',
        routeLabel: 'counts/plans',
        routerLink: ['/app', 'inventory', 'counts', 'plans'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.COUNT_PLAN_NEW.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_PLAN_NEW.DESCRIPTION',
        routeLabel: 'counts/plans/new',
        routerLink: ['/app', 'inventory', 'counts', 'plans', 'new'],
      },
    ],
  },
  {
    titleKey: 'INVENTORY.LANDING.SECTION.PURCHASE_ORDERS.TITLE',
    descriptionKey: 'INVENTORY.LANDING.SECTION.PURCHASE_ORDERS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.PO_LIST.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PO_LIST.DESCRIPTION',
        routeLabel: 'purchase-orders',
        routerLink: ['/app', 'inventory', 'purchase-orders'],
      },
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.PO_NEW.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PO_NEW.DESCRIPTION',
        routeLabel: 'purchase-orders/new',
        routerLink: ['/app', 'inventory', 'purchase-orders', 'new'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.PO_DETAIL.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PO_DETAIL.DESCRIPTION',
        routeLabel: 'purchase-orders/:poId',
        field: 'poId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.PO_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.PO_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_PO',
        buildCommands: (v) => ['/app', 'inventory', 'purchase-orders', v],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.PO_EDIT.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PO_EDIT.DESCRIPTION',
        routeLabel: 'purchase-orders/:poId/edit',
        field: 'poEditId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.PO_EDIT_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.PO_EDIT_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_PO_EDIT',
        buildCommands: (v) => ['/app', 'inventory', 'purchase-orders', v, 'edit'],
      },
    ],
  },
  {
    titleKey: 'INVENTORY.LANDING.SECTION.FULFILLMENT.TITLE',
    descriptionKey: 'INVENTORY.LANDING.SECTION.FULFILLMENT.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.PICK_LIST.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PICK_LIST.DESCRIPTION',
        routeLabel: 'fulfillment/workorders/:workorderId/pick-list',
        field: 'workorderPickListId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.WORKORDER_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_PICK_LIST',
        buildCommands: (v) => ['/app', 'inventory', 'fulfillment', 'workorders', v, 'pick-list'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.PICK_EXECUTE.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.PICK_EXECUTE.DESCRIPTION',
        routeLabel: 'fulfillment/workorders/:workorderId/pick-execute',
        field: 'workorderPickExecuteId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.WORKORDER_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.EXECUTE_PICK',
        buildCommands: (v) => ['/app', 'inventory', 'fulfillment', 'workorders', v, 'pick-execute'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.RETURN_TO_STOCK.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.RETURN_TO_STOCK.DESCRIPTION',
        routeLabel: 'fulfillment/workorders/:workorderId/return-to-stock',
        field: 'workorderReturnId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.WORKORDER_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_RETURN',
        buildCommands: (v) => ['/app', 'inventory', 'fulfillment', 'workorders', v, 'return-to-stock'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.CONSUME_ITEMS.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.CONSUME_ITEMS.DESCRIPTION',
        routeLabel: 'fulfillment/workorders/:workorderId/consume-items',
        field: 'workorderConsumeId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.WORKORDER_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_CONSUME',
        buildCommands: (v) => ['/app', 'inventory', 'fulfillment', 'workorders', v, 'consume-items'],
      },
      {
        kind: 'launch',
        titleKey: 'INVENTORY.LANDING.CARD.SHORTAGE_RESOLUTION.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.SHORTAGE_RESOLUTION.DESCRIPTION',
        routeLabel: 'fulfillment/workorders/:workorderId/shortage-resolution',
        field: 'workorderShortageId',
        fieldLabelKey: 'INVENTORY.LANDING.FIELD.WORKORDER_ID',
        placeholderKey: 'INVENTORY.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'INVENTORY.LANDING.ACTION.OPEN_SHORTAGE',
        buildCommands: (v) => ['/app', 'inventory', 'fulfillment', 'workorders', v, 'shortage-resolution'],
      },
    ],
  },
  {
    titleKey: 'INVENTORY.LANDING.SECTION.ADMIN.TITLE',
    descriptionKey: 'INVENTORY.LANDING.SECTION.ADMIN.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'INVENTORY.LANDING.CARD.SECURITY_PERMISSIONS.TITLE',
        descriptionKey: 'INVENTORY.LANDING.CARD.SECURITY_PERMISSIONS.DESCRIPTION',
        routeLabel: 'security/permissions',
        routerLink: ['/app', 'inventory', 'security', 'permissions'],
      },
    ],
  },
];

@Component({
  selector: 'app-inventory-landing-page',
  templateUrl: './inventory-landing-page.component.html',
  styleUrl: './inventory-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
})
export class InventoryLandingPageComponent {
  private readonly router = inject(Router);

  readonly sections = LANDING_SECTIONS;
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);

  private readonly launchValues = signal<Partial<Record<LaunchField, string>>>({});
  private readonly launchErrors = signal<Partial<Record<LaunchField, string | null>>>({});

  readonly directLinkCount = LANDING_SECTIONS.flatMap((s) => s.cards).filter(
    (c): c is DirectCard => c.kind === 'direct',
  ).length;

  readonly guidedLinkCount = LANDING_SECTIONS.flatMap((s) => s.cards).filter(
    (c): c is LaunchCard => c.kind === 'launch',
  ).length;

  readonly totalPageCount = this.directLinkCount + this.guidedLinkCount;

  isLaunchCard(card: LandingCard): card is LaunchCard {
    return card.kind === 'launch';
  }

  launchValue(field: LaunchField): string {
    return this.launchValues()[field] ?? '';
  }

  launchError(field: LaunchField): string | null {
    return this.launchErrors()[field] ?? null;
  }

  updateLaunchValue(field: LaunchField, value: string): void {
    this.launchValues.update((prev) => ({ ...prev, [field]: value }));
    if (value.trim()) {
      this.launchErrors.update((prev) => ({ ...prev, [field]: null }));
    }
  }

  async openLaunch(card: LaunchCard): Promise<void> {
    const value = this.launchValue(card.field).trim();
    if (!value) {
      this.launchErrors.update((prev) => ({
        ...prev,
        [card.field]: 'INVENTORY.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      return;
    }

    this.launchErrors.update((prev) => ({ ...prev, [card.field]: null }));
    this.errorKey.set(null);
    this.state.set('loading');
    this.activeLaunchField.set(card.field);

    try {
      const result = await this.router.navigate(card.buildCommands(value));
      if (result === false) {
        this.state.set('error');
        this.errorKey.set('INVENTORY.LANDING.ERROR.NAVIGATE');
      } else {
        this.state.set('idle');
      }
    } catch {
      this.state.set('error');
      this.errorKey.set('INVENTORY.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
