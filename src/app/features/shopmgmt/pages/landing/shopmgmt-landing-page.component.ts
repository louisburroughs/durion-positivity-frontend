import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'appointmentAssignId'
  | 'appointmentRescheduleId'
  | 'appointmentEditId'
  | 'appointmentOverrideId'
  | 'appointmentDispatchAssignId';

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
    titleKey: 'SHOPMGMT.LANDING.CARD.DISPATCH_BOARD.TITLE',
    descriptionKey: 'SHOPMGMT.LANDING.CARD.DISPATCH_BOARD.DESCRIPTION',
    route: '/app/shopmgmt/dispatch-board',
    actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'SHOPMGMT.LANDING.CARD.SCHEDULE.TITLE',
    descriptionKey: 'SHOPMGMT.LANDING.CARD.SCHEDULE.DESCRIPTION',
    route: '/app/shopmgmt/schedule',
    actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
  },
] as const;

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'SHOPMGMT.LANDING.SECTION.DISPATCH.TITLE',
    descriptionKey: 'SHOPMGMT.LANDING.SECTION.DISPATCH.DESCRIPTION',
    cards: [
      ...HERO_DIRECT_CARDS,
    ],
  },
  {
    titleKey: 'SHOPMGMT.LANDING.SECTION.APPOINTMENTS.TITLE',
    descriptionKey: 'SHOPMGMT.LANDING.SECTION.APPOINTMENTS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW.DESCRIPTION',
        route: '/app/shopmgmt/appointments/new',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW_CRM.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_NEW_CRM.DESCRIPTION',
        route: '/app/shopmgmt/appointments/new/crm',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_ASSIGNMENT.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_ASSIGNMENT.DESCRIPTION',
        field: 'appointmentAssignId',
        inputLabelKey: 'SHOPMGMT.LANDING.FIELD.APPOINTMENT_ID',
        inputPlaceholderKey: 'SHOPMGMT.LANDING.PLACEHOLDER.APPOINTMENT_ID',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_ASSIGNMENT',
        buildCommands: (value: string) => ['/app', 'shopmgmt', 'appointments', value, 'assignments'],
      },
      {
        kind: 'launch',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_RESCHEDULE.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_RESCHEDULE.DESCRIPTION',
        field: 'appointmentRescheduleId',
        inputLabelKey: 'SHOPMGMT.LANDING.FIELD.APPOINTMENT_ID',
        inputPlaceholderKey: 'SHOPMGMT.LANDING.PLACEHOLDER.APPOINTMENT_ID',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_RESCHEDULE',
        buildCommands: (value: string) => ['/app', 'shopmgmt', 'appointments', value, 'reschedule'],
      },
      {
        kind: 'launch',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_EDIT.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_EDIT.DESCRIPTION',
        field: 'appointmentEditId',
        inputLabelKey: 'SHOPMGMT.LANDING.FIELD.APPOINTMENT_ID',
        inputPlaceholderKey: 'SHOPMGMT.LANDING.PLACEHOLDER.APPOINTMENT_ID',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_EDIT',
        buildCommands: (value: string) => ['/app', 'shopmgmt', 'appointments', value, 'edit'],
      },
      {
        kind: 'launch',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_OVERRIDE.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_OVERRIDE.DESCRIPTION',
        field: 'appointmentOverrideId',
        inputLabelKey: 'SHOPMGMT.LANDING.FIELD.APPOINTMENT_ID',
        inputPlaceholderKey: 'SHOPMGMT.LANDING.PLACEHOLDER.APPOINTMENT_ID',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_OVERRIDE',
        buildCommands: (value: string) => ['/app', 'shopmgmt', 'appointments', value, 'override-conflict'],
      },
      {
        kind: 'launch',
        titleKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_DISPATCH_ASSIGN.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.APPOINTMENT_DISPATCH_ASSIGN.DESCRIPTION',
        field: 'appointmentDispatchAssignId',
        inputLabelKey: 'SHOPMGMT.LANDING.FIELD.APPOINTMENT_ID',
        inputPlaceholderKey: 'SHOPMGMT.LANDING.PLACEHOLDER.APPOINTMENT_ID',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_DISPATCH_ASSIGN',
        buildCommands: (value: string) => ['/app', 'shopmgmt', 'appointments', value, 'dispatch-assign'],
      },
    ],
  },
  {
    titleKey: 'SHOPMGMT.LANDING.SECTION.MECHANICS.TITLE',
    descriptionKey: 'SHOPMGMT.LANDING.SECTION.MECHANICS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_AVAILABILITY.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_AVAILABILITY.DESCRIPTION',
        route: '/app/shopmgmt/mechanics/availability',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_ROSTER.TITLE',
        descriptionKey: 'SHOPMGMT.LANDING.CARD.MECHANIC_ROSTER.DESCRIPTION',
        route: '/app/shopmgmt/mechanics/roster',
        actionKey: 'SHOPMGMT.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
] as const;

@Component({
  selector: 'app-shopmgmt-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './shopmgmt-landing-page.component.html',
  styleUrl: './shopmgmt-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopmgmtLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    appointmentAssignId: '',
    appointmentRescheduleId: '',
    appointmentEditId: '',
    appointmentOverrideId: '',
    appointmentDispatchAssignId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;
  readonly heroDispatchRoute = HERO_DIRECT_CARDS[0].route;
  readonly heroScheduleRoute = HERO_DIRECT_CARDS[1].route;

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
        [card.field]: 'SHOPMGMT.LANDING.ERROR.REQUIRED_IDENTIFIER',
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
        this.errorKey.set('SHOPMGMT.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('SHOPMGMT.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
