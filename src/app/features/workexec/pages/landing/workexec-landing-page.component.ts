import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'estimateId'
  | 'estimatePartsId'
  | 'estimateLaborId'
  | 'estimateReviseId'
  | 'estimateSummaryId'
  | 'approvalSubmitId'
  | 'approvalDigitalId'
  | 'approvalInPersonId'
  | 'approvalPartialId'
  | 'approvalDetailId'
  | 'workorderId'
  | 'workorderAssignId'
  | 'workorderLaborId'
  | 'workorderPartsId'
  | 'workorderChangeRequestsId'
  | 'workorderFinalizeId'
  | 'workorderInvoiceId'
  | 'workorderOpContextId';

type PageState = 'ready' | 'loading' | 'error';

interface DirectCard {
  readonly kind: 'direct';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly route: string;
  readonly actionKey: string;
}

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly field: LaunchField;
  readonly inputLabelKey: string;
  readonly inputPlaceholderKey: string;
  readonly actionKey: string;
  readonly buildCommands: (value: string) => readonly string[];
}

interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly cards: readonly (DirectCard | LaunchCard)[];
}

const HERO_DIRECT_CARDS: readonly DirectCard[] = [
  {
    kind: 'direct',
    titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LIST.TITLE',
    descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LIST.DESCRIPTION',
    route: '/app/workexec/estimate-list',
    actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_NEW.TITLE',
    descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_NEW.DESCRIPTION',
    route: '/app/workexec/estimates/new',
    actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
  },
] as const;

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'WORKEXEC.LANDING.SECTION.ESTIMATES.TITLE',
    descriptionKey: 'WORKEXEC.LANDING.SECTION.ESTIMATES.DESCRIPTION',
    cards: [
      ...HERO_DIRECT_CARDS,
      {
        kind: 'direct',
        titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_FROM_APPOINTMENT.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_FROM_APPOINTMENT.DESCRIPTION',
        route: '/app/workexec/workorders/from-appointment',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_DETAIL.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_DETAIL.DESCRIPTION',
        field: 'estimateId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_PARTS.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_PARTS.DESCRIPTION',
        field: 'estimatePartsId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_PARTS',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'parts'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LABOR.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_LABOR.DESCRIPTION',
        field: 'estimateLaborId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_LABOR',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'labor'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_REVISE.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_REVISE.DESCRIPTION',
        field: 'estimateReviseId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_REVISE',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'revise'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_SUMMARY.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.ESTIMATE_SUMMARY.DESCRIPTION',
        field: 'estimateSummaryId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_ESTIMATE_SUMMARY',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'summary'],
      },
    ],
  },
  {
    titleKey: 'WORKEXEC.LANDING.SECTION.APPROVAL.TITLE',
    descriptionKey: 'WORKEXEC.LANDING.SECTION.APPROVAL.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_SUBMIT.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_SUBMIT.DESCRIPTION',
        field: 'approvalSubmitId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_SUBMIT',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'approval', 'submit'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DIGITAL.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DIGITAL.DESCRIPTION',
        field: 'approvalDigitalId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_DIGITAL',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'approval', 'digital'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_IN_PERSON.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_IN_PERSON.DESCRIPTION',
        field: 'approvalInPersonId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_IN_PERSON',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'approval', 'in-person'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_PARTIAL.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_PARTIAL.DESCRIPTION',
        field: 'approvalPartialId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.ESTIMATE_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.ESTIMATE_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_PARTIAL',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'approval', 'partial'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DETAIL.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.APPROVAL_DETAIL.DESCRIPTION',
        field: 'approvalDetailId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.APPROVAL_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.APPROVAL_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_APPROVAL_DETAIL',
        buildCommands: (value: string) => ['/app', 'workexec', 'estimates', value, 'approval', value],
      },
    ],
  },
  {
    titleKey: 'WORKEXEC.LANDING.SECTION.WORKORDERS.TITLE',
    descriptionKey: 'WORKEXEC.LANDING.SECTION.WORKORDERS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'WORKEXEC.LANDING.CARD.WIP_STATUS.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WIP_STATUS.DESCRIPTION',
        route: '/app/workexec/wip-status',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_DETAIL.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_DETAIL.DESCRIPTION',
        field: 'workorderId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_ASSIGN.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_ASSIGN.DESCRIPTION',
        field: 'workorderAssignId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_ASSIGN',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'assign'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_LABOR.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_LABOR.DESCRIPTION',
        field: 'workorderLaborId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_LABOR',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'labor'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_PARTS.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_PARTS.DESCRIPTION',
        field: 'workorderPartsId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_PARTS',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'parts'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_CHANGE_REQUESTS.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_CHANGE_REQUESTS.DESCRIPTION',
        field: 'workorderChangeRequestsId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_CHANGE_REQUESTS',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'change-requests'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.WORKORDER_FINALIZE.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.WORKORDER_FINALIZE.DESCRIPTION',
        field: 'workorderFinalizeId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_WORKORDER_FINALIZE',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'finalize'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.INVOICE_FINALIZATION.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.INVOICE_FINALIZATION.DESCRIPTION',
        field: 'workorderInvoiceId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_INVOICE_FINALIZATION',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'invoice-finalization'],
      },
      {
        kind: 'launch',
        titleKey: 'WORKEXEC.LANDING.CARD.OPERATIONAL_CONTEXT.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.OPERATIONAL_CONTEXT.DESCRIPTION',
        field: 'workorderOpContextId',
        inputLabelKey: 'WORKEXEC.LANDING.FIELD.WORKORDER_ID',
        inputPlaceholderKey: 'WORKEXEC.LANDING.PLACEHOLDER.WORKORDER_ID',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_OPERATIONAL_CONTEXT',
        buildCommands: (value: string) => ['/app', 'workexec', 'workorders', value, 'operational-context'],
      },
    ],
  },
  {
    titleKey: 'WORKEXEC.LANDING.SECTION.TOOLS.TITLE',
    descriptionKey: 'WORKEXEC.LANDING.SECTION.TOOLS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'WORKEXEC.LANDING.CARD.TRAVEL_TIME.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.TRAVEL_TIME.DESCRIPTION',
        route: '/app/workexec/travel-time',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'WORKEXEC.LANDING.CARD.TIMER.TITLE',
        descriptionKey: 'WORKEXEC.LANDING.CARD.TIMER.DESCRIPTION',
        route: '/app/workexec/timer',
        actionKey: 'WORKEXEC.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
] as const;

@Component({
  selector: 'app-workexec-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './workexec-landing-page.component.html',
  styleUrl: './workexec-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkexecLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    estimateId: '',
    estimatePartsId: '',
    estimateLaborId: '',
    estimateReviseId: '',
    estimateSummaryId: '',
    approvalSubmitId: '',
    approvalDigitalId: '',
    approvalInPersonId: '',
    approvalPartialId: '',
    approvalDetailId: '',
    workorderId: '',
    workorderAssignId: '',
    workorderLaborId: '',
    workorderPartsId: '',
    workorderChangeRequestsId: '',
    workorderFinalizeId: '',
    workorderInvoiceId: '',
    workorderOpContextId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;
  readonly heroEstimateListRoute = HERO_DIRECT_CARDS[0].route;
  readonly heroEstimateNewRoute = HERO_DIRECT_CARDS[1].route;

  readonly directLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(
    c => c.kind === 'direct',
  ).length;
  readonly guidedLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(
    c => c.kind === 'launch',
  ).length;
  readonly totalPageCount = this.directLinkCount + this.guidedLinkCount;

  isLaunchCard(card: DirectCard | LaunchCard): card is LaunchCard {
    return card.kind === 'launch';
  }

  updateLaunchValue(field: LaunchField, value: string): void {
    this.launchValues.update(prev => ({ ...prev, [field]: value }));
    this.launchErrors.update(prev => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  }

  launchValue(field: LaunchField): string {
    return this.launchValues()[field];
  }

  launchError(field: LaunchField): string | null {
    return this.launchErrors()[field] ?? null;
  }

  async openLaunch(card: LaunchCard): Promise<void> {
    const value = this.launchValues()[card.field].trim();
    if (!value) {
      this.launchErrors.update(prev => ({
        ...prev,
        [card.field]: 'WORKEXEC.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      return;
    }

    this.launchErrors.update(prev => {
      const { [card.field]: _cleared, ...rest } = prev;
      return rest;
    });
    this.errorKey.set(null);
    this.state.set('loading');
    this.activeLaunchField.set(card.field);

    try {
      const navigated = await this.router.navigate(card.buildCommands(value));
      if (!navigated) {
        this.state.set('error');
        this.errorKey.set('WORKEXEC.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('WORKEXEC.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
