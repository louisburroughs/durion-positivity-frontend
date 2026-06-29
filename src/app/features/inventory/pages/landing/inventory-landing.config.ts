import { LandingPageConfig } from '../../../../shared/landing/landing.models';

const WO = (...rest: string[]) => (id: string): string[] => [
  '/app',
  'inventory',
  'fulfillment',
  'workorders',
  id,
  ...rest,
];

/**
 * Inventory landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing INVENTORY.LANDING.* i18n keys. Each section that needs an
 * identifier resolves exactly one record kind: Stock & Availability => ledger,
 * Receiving & Replenishment => putaway, Purchase Orders => po, Fulfillment =>
 * workorder (id-input mode — no backend name search wired here).
 */
export const INVENTORY_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.INVENTORY',
  titleKey: 'INVENTORY.LANDING.TITLE',
  descriptionKey: 'INVENTORY.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'INVENTORY.LANDING.HERO.OPEN_AVAILABILITY',
    icon: 'inventory_2',
    route: '/app/inventory/availability',
  },
  secondaryCta: {
    labelKey: 'INVENTORY.LANDING.HERO.NEW_PURCHASE_ORDER',
    route: '/app/inventory/purchase-orders/new',
  },
  sections: [
    {
      titleKey: 'INVENTORY.LANDING.SECTION.STOCK.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.STOCK.DESCRIPTION',
      recordKind: 'ledger',
      cards: [
        {
          kind: 'direct',
          icon: 'inventory_2',
          titleKey: 'INVENTORY.LANDING.CARD.INVENTORY_BY_LOCATION.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.INVENTORY_BY_LOCATION.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/by-location',
        },
        {
          kind: 'direct',
          icon: 'search',
          titleKey: 'INVENTORY.LANDING.CARD.AVAILABILITY.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.AVAILABILITY.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/availability',
        },
        {
          kind: 'direct',
          icon: 'receipt_long',
          titleKey: 'INVENTORY.LANDING.CARD.LEDGER.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.LEDGER.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/ledger',
        },
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'INVENTORY.LANDING.CARD.LEDGER_ENTRY.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.LEDGER_ENTRY.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_LEDGER_ENTRY',
          buildCommands: (id) => ['/app', 'inventory', 'ledger', id],
        },
      ],
    },
    {
      titleKey: 'INVENTORY.LANDING.SECTION.RECEIVING.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.RECEIVING.DESCRIPTION',
      recordKind: 'putaway',
      cards: [
        {
          kind: 'direct',
          icon: 'move_to_inbox',
          titleKey: 'INVENTORY.LANDING.CARD.RECEIVE_INTO_STAGING.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.RECEIVE_INTO_STAGING.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/receiving/receive-into-staging',
        },
        {
          kind: 'direct',
          icon: 'swap_horiz',
          titleKey: 'INVENTORY.LANDING.CARD.CROSS_DOCK.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.CROSS_DOCK.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/receiving/cross-dock',
        },
        {
          kind: 'direct',
          icon: 'checklist',
          titleKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASKS.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASKS.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/putaway/tasks',
        },
        {
          kind: 'guided',
          icon: 'task_alt',
          titleKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASK.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PUTAWAY_TASK.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PUTAWAY_TASK',
          buildCommands: (id) => ['/app', 'inventory', 'putaway', 'tasks', id],
        },
        {
          kind: 'direct',
          icon: 'autorenew',
          titleKey: 'INVENTORY.LANDING.CARD.REPLENISHMENT.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.REPLENISHMENT.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/replenishment/tasks',
        },
      ],
    },
    {
      titleKey: 'INVENTORY.LANDING.SECTION.COUNTS.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.COUNTS.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'fact_check',
          titleKey: 'INVENTORY.LANDING.CARD.COUNT_EXECUTE.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_EXECUTE.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/counts/execute',
        },
        {
          kind: 'direct',
          icon: 'tune',
          titleKey: 'INVENTORY.LANDING.CARD.COUNT_ADJUSTMENTS.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_ADJUSTMENTS.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/counts/adjustments',
        },
        {
          kind: 'direct',
          icon: 'event_note',
          titleKey: 'INVENTORY.LANDING.CARD.COUNT_PLANS.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_PLANS.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/counts/plans',
        },
        {
          kind: 'direct',
          icon: 'add_task',
          titleKey: 'INVENTORY.LANDING.CARD.COUNT_PLAN_NEW.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.COUNT_PLAN_NEW.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/counts/plans/new',
        },
      ],
    },
    {
      titleKey: 'INVENTORY.LANDING.SECTION.PURCHASE_ORDERS.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.PURCHASE_ORDERS.DESCRIPTION',
      recordKind: 'po',
      cards: [
        {
          kind: 'direct',
          icon: 'list_alt',
          titleKey: 'INVENTORY.LANDING.CARD.PO_LIST.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PO_LIST.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/purchase-orders',
        },
        {
          kind: 'direct',
          icon: 'post_add',
          titleKey: 'INVENTORY.LANDING.CARD.PO_NEW.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PO_NEW.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/purchase-orders/new',
        },
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'INVENTORY.LANDING.CARD.PO_DETAIL.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PO_DETAIL.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PO',
          buildCommands: (id) => ['/app', 'inventory', 'purchase-orders', id],
        },
        {
          kind: 'guided',
          icon: 'edit_document',
          titleKey: 'INVENTORY.LANDING.CARD.PO_EDIT.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PO_EDIT.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PO_EDIT',
          buildCommands: (id) => ['/app', 'inventory', 'purchase-orders', id, 'edit'],
        },
      ],
    },
    {
      titleKey: 'INVENTORY.LANDING.SECTION.FULFILLMENT.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.FULFILLMENT.DESCRIPTION',
      recordKind: 'workorder',
      idMode: true,
      cards: [
        {
          kind: 'guided',
          icon: 'list',
          titleKey: 'INVENTORY.LANDING.CARD.PICK_LIST.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PICK_LIST.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PICK_LIST',
          buildCommands: WO('pick-list'),
        },
        {
          kind: 'guided',
          icon: 'shopping_cart_checkout',
          titleKey: 'INVENTORY.LANDING.CARD.PICK_EXECUTE.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.PICK_EXECUTE.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.EXECUTE_PICK',
          buildCommands: WO('pick-execute'),
        },
        {
          kind: 'guided',
          icon: 'assignment_return',
          titleKey: 'INVENTORY.LANDING.CARD.RETURN_TO_STOCK.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.RETURN_TO_STOCK.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_RETURN',
          buildCommands: WO('return-to-stock'),
        },
        {
          kind: 'guided',
          icon: 'remove_shopping_cart',
          titleKey: 'INVENTORY.LANDING.CARD.CONSUME_ITEMS.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.CONSUME_ITEMS.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_CONSUME',
          buildCommands: WO('consume-items'),
        },
        {
          kind: 'guided',
          icon: 'report_problem',
          titleKey: 'INVENTORY.LANDING.CARD.SHORTAGE_RESOLUTION.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.SHORTAGE_RESOLUTION.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_SHORTAGE',
          buildCommands: WO('shortage-resolution'),
        },
      ],
    },
    {
      titleKey: 'INVENTORY.LANDING.SECTION.ADMIN.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.ADMIN.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'admin_panel_settings',
          titleKey: 'INVENTORY.LANDING.CARD.SECURITY_PERMISSIONS.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.SECURITY_PERMISSIONS.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          route: '/app/inventory/security/permissions',
        },
      ],
    },
    {
      titleKey: 'INVENTORY.LANDING.SECTION.DATA_IMPORT.TITLE',
      descriptionKey: 'INVENTORY.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'upload_file',
          titleKey: 'INVENTORY.LANDING.CARD.IMPORT_STOCK.TITLE',
          descriptionKey: 'INVENTORY.LANDING.CARD.IMPORT_STOCK.DESCRIPTION',
          ctaKey: 'INVENTORY.LANDING.ACTION.OPEN_PAGE',
          ctaIcon: 'upload',
          route: '/app/inventory/bulk-import/stock',
        },
      ],
    },
  ],
};
