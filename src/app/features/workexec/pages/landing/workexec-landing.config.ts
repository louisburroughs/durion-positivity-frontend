import { WORKEXEC_PAGE } from '../../../../core/security/route-permissions';
import { LandingPageConfig } from '../../../../shared/landing/landing.models';

const E = (...rest: string[]) => (id: string): string[] => ['/app', 'workexec', 'estimates', id, ...rest];
const W = (...rest: string[]) => (id: string): string[] => ['/app', 'workexec', 'workorders', id, ...rest];

/**
 * Workexec landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing WORKEXEC.LANDING.* i18n keys. Estimate and Customer Approval
 * sections resolve an estimate record; Workorder Execution resolves a workorder.
 */
/**
 * Every card carries the same access requirement as the route it opens, so the
 * shared landing component can drop the ones this session's permissions would
 * bounce at the guard. Keep the two in step — `core/security/page-access.spec.ts`
 * fails the build when a card and its route disagree.
 */
export const WORKEXEC_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.WORKORDERS',
  titleKey: 'WORKEXEC.LANDING.TITLE',
  descriptionKey: 'WORKEXEC.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'WORKEXEC.LANDING.HERO_CTA_NEW',
    icon: 'add',
    route: '/app/workexec/estimates/new',
    permissions: WORKEXEC_PAGE.estimateCreate,
  },
  secondaryCta: {
    labelKey: 'WORKEXEC.LANDING.HERO_CTA_LIST',
    route: '/app/workexec/estimate-list',
    permissions: WORKEXEC_PAGE.estimateView,
  },
  sections: [
    {
      titleKey: 'WORKEXEC.LANDING.SECTION.ESTIMATES.TITLE',
      descriptionKey: 'WORKEXEC.LANDING.SECTION.ESTIMATES.DESCRIPTION',
      recordKind: 'estimate',
      cards: [
        {
          kind: 'direct',
          icon: 'list_alt',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LIST.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LIST.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
          route: '/app/workexec/estimate-list',
          permissions: WORKEXEC_PAGE.estimateView,
        },
        {
          kind: 'direct',
          icon: 'note_add',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_NEW.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_NEW.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
          route: '/app/workexec/estimates/new',
          permissions: WORKEXEC_PAGE.estimateCreate,
        },
        {
          kind: 'direct',
          icon: 'event_available',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_FROM_APPOINTMENT.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_FROM_APPOINTMENT.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
          route: '/app/workexec/workorders/from-appointment',
          permissions: WORKEXEC_PAGE.estimateCreate,
        },
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_DETAIL.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_DETAIL.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE',
          buildCommands: E(),
          permissions: WORKEXEC_PAGE.estimateView,
        },
        {
          kind: 'guided',
          icon: 'build',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_PARTS.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_PARTS.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_PARTS',
          buildCommands: E('parts'),
          permissions: WORKEXEC_PAGE.estimateView,
        },
        {
          kind: 'guided',
          icon: 'engineering',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LABOR.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LABOR.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_LABOR',
          buildCommands: E('labor'),
          permissions: WORKEXEC_PAGE.estimateView,
        },
        {
          kind: 'guided',
          icon: 'history',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_REVISE.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_REVISE.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_REVISE',
          buildCommands: E('revise'),
          permissions: WORKEXEC_PAGE.estimateRevise,
        },
        {
          kind: 'guided',
          icon: 'summarize',
          titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_SUMMARY.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_SUMMARY.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_SUMMARY',
          buildCommands: E('summary'),
          permissions: WORKEXEC_PAGE.estimateView,
        },
      ],
    },
    {
      titleKey: 'WORKEXEC.LANDING.SECTION.APPROVAL.TITLE',
      descriptionKey: 'WORKEXEC.LANDING.SECTION.APPROVAL.DESCRIPTION',
      recordKind: 'estimate',
      cards: [
        {
          kind: 'guided',
          icon: 'send',
          titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_SUBMIT.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_SUBMIT.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_SUBMIT',
          buildCommands: E('approval', 'submit'),
          permissions: WORKEXEC_PAGE.estimateSubmit,
        },
        {
          kind: 'guided',
          icon: 'sms',
          titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DIGITAL.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DIGITAL.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_DIGITAL',
          buildCommands: E('approval', 'digital'),
          permissions: WORKEXEC_PAGE.estimateApprove,
        },
        {
          kind: 'guided',
          icon: 'draw',
          titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_IN_PERSON.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_IN_PERSON.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_IN_PERSON',
          buildCommands: E('approval', 'in-person'),
          permissions: WORKEXEC_PAGE.estimateApprove,
        },
        {
          kind: 'guided',
          icon: 'rule',
          titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_PARTIAL.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_PARTIAL.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_PARTIAL',
          buildCommands: E('approval', 'partial'),
          permissions: WORKEXEC_PAGE.estimateApprove,
        },
        {
          kind: 'guided',
          icon: 'fact_check',
          titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DETAIL.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DETAIL.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_DETAIL',
          // Route is estimates/:estimateId/approval/:approvalId — the section
          // selector resolves the estimate; the approval id is captured here.
          secondary: {
            labelKey: 'WORKEXEC.LANDING.FIELD.APPROVAL_ID',
            placeholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.APPROVAL_ID',
          },
          buildCommands: (id, approvalId) => ['/app', 'workexec', 'estimates', id, 'approval', approvalId ?? ''],
          permissions: WORKEXEC_PAGE.estimateView,
        },
      ],
    },
    {
      titleKey: 'WORKEXEC.LANDING.SECTION.WORKORDERS.TITLE',
      descriptionKey: 'WORKEXEC.LANDING.SECTION.WORKORDERS.DESCRIPTION',
      recordKind: 'workorder',
      cards: [
        {
          kind: 'direct',
          icon: 'dashboard',
          titleKey: 'WORKEXEC.LANDING.CARD.WIP_STATUS.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WIP_STATUS.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
          route: '/app/workexec/wip-status',
          permissions: WORKEXEC_PAGE.wip,
        },
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_DETAIL.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_DETAIL.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER',
          buildCommands: W(),
        },
        {
          kind: 'guided',
          icon: 'engineering',
          titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_ASSIGN.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_ASSIGN.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_ASSIGN',
          buildCommands: W('assign'),
          permissions: WORKEXEC_PAGE.workorderAssign,
        },
        {
          kind: 'guided',
          icon: 'schedule',
          titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_LABOR.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_LABOR.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_LABOR',
          buildCommands: W('labor'),
          permissions: WORKEXEC_PAGE.laborView,
        },
        {
          kind: 'guided',
          icon: 'build',
          titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_PARTS.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_PARTS.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_PARTS',
          buildCommands: W('parts'),
          permissions: WORKEXEC_PAGE.partsView,
        },
        {
          kind: 'guided',
          icon: 'edit_note',
          titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_CHANGE_REQUESTS.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_CHANGE_REQUESTS.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_CHANGE_REQUESTS',
          buildCommands: W('change-requests'),
          permissions: WORKEXEC_PAGE.changeRequests,
        },
        {
          kind: 'guided',
          icon: 'lock',
          titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_FINALIZE.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_FINALIZE.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_FINALIZE',
          buildCommands: W('finalize'),
          permissions: WORKEXEC_PAGE.workorderView,
        },
        {
          kind: 'guided',
          icon: 'receipt_long',
          titleKey: 'WORKEXEC.LANDING.CARD.INVOICE_FINALIZATION.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.INVOICE_FINALIZATION.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_INVOICE_FINALIZATION',
          buildCommands: W('invoice-finalization'),
        },
        {
          kind: 'guided',
          icon: 'monitor_heart',
          titleKey: 'WORKEXEC.LANDING.CARD.OPERATIONAL_CONTEXT.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.OPERATIONAL_CONTEXT.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_OPERATIONAL_CONTEXT',
          buildCommands: W('operational-context'),
        },
      ],
    },
    {
      titleKey: 'WORKEXEC.LANDING.SECTION.TOOLS.TITLE',
      descriptionKey: 'WORKEXEC.LANDING.SECTION.TOOLS.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'directions_car',
          titleKey: 'WORKEXEC.LANDING.CARD.TRAVEL_TIME.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.TRAVEL_TIME.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
          route: '/app/workexec/travel-time',
          permissions: WORKEXEC_PAGE.travelTime,
        },
        {
          kind: 'direct',
          icon: 'timer',
          titleKey: 'WORKEXEC.LANDING.CARD.TIMER.TITLE',
          descriptionKey: 'WORKEXEC.LANDING.CARD.TIMER.DESCRIPTION',
          ctaKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
          route: '/app/workexec/timer',
          permissions: WORKEXEC_PAGE.laborView,
        },
      ],
    },
  ],
};
