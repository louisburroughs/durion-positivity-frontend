import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'personUuid'
  | 'sessionId'
  | 'employeeProfileId'
  | 'employeeOffboardId'
  | 'personLocationId';

type PageState = 'ready' | 'loading' | 'error';

interface BaseCard {
  titleKey: string;
  descriptionKey: string;
  routePattern: string;
  actionKey: string;
}

interface DirectCard extends BaseCard {
  kind: 'direct';
  route: string;
}

interface LaunchCard extends BaseCard {
  kind: 'launch';
  field: LaunchField;
  inputLabelKey: string;
  inputPlaceholderKey: string;
  buildCommands: (value: string) => readonly string[];
}

interface LandingSection {
  titleKey: string;
  descriptionKey: string;
  cards: readonly (DirectCard | LaunchCard)[];
}

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'PEOPLE.LANDING.SECTION.TIMEKEEPING.TITLE',
    descriptionKey: 'PEOPLE.LANDING.SECTION.TIMEKEEPING.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'PEOPLE.LANDING.CARD.TIME_APPROVAL.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.TIME_APPROVAL.DESCRIPTION',
        routePattern: '/app/people/timekeeping/approval',
        route: '/app/people/timekeeping/approval',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'PEOPLE.LANDING.CARD.WORK_SESSION.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.WORK_SESSION.DESCRIPTION',
        routePattern: '/app/people/timekeeping/work-session',
        route: '/app/people/timekeeping/work-session',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'PEOPLE.LANDING.CARD.WORK_SESSION_SUBMIT.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.WORK_SESSION_SUBMIT.DESCRIPTION',
        routePattern: '/app/people/timekeeping/work-session/:sessionId/submit',
        field: 'sessionId',
        inputLabelKey: 'PEOPLE.LANDING.FIELD.SESSION_ID',
        inputPlaceholderKey: 'PEOPLE.LANDING.PLACEHOLDER.SESSION_ID',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_WORK_SESSION_SUBMIT',
        buildCommands: value => ['/app', 'people', 'timekeeping', 'work-session', value, 'submit'],
      },
      {
        kind: 'direct',
        titleKey: 'PEOPLE.LANDING.CARD.TIME_EXPORT.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.TIME_EXPORT.DESCRIPTION',
        routePattern: '/app/people/timekeeping/export',
        route: '/app/people/timekeeping/export',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'PEOPLE.LANDING.CARD.DISCREPANCY.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.DISCREPANCY.DESCRIPTION',
        routePattern: '/app/people/timekeeping/discrepancy',
        route: '/app/people/timekeeping/discrepancy',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'PEOPLE.LANDING.SECTION.EMPLOYEES.TITLE',
    descriptionKey: 'PEOPLE.LANDING.SECTION.EMPLOYEES.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_NEW.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_NEW.DESCRIPTION',
        routePattern: '/app/people/employees/new',
        route: '/app/people/employees/new',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_PROFILE.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_PROFILE.DESCRIPTION',
        routePattern: '/app/people/employees/:id',
        field: 'employeeProfileId',
        inputLabelKey: 'PEOPLE.LANDING.FIELD.EMPLOYEE_ID',
        inputPlaceholderKey: 'PEOPLE.LANDING.PLACEHOLDER.EMPLOYEE_ID',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_EMPLOYEE_PROFILE',
        buildCommands: value => ['/app', 'people', 'employees', value],
      },
      {
        kind: 'launch',
        titleKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_OFFBOARD.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.EMPLOYEE_OFFBOARD.DESCRIPTION',
        routePattern: '/app/people/employees/:id/offboard',
        field: 'employeeOffboardId',
        inputLabelKey: 'PEOPLE.LANDING.FIELD.OFFBOARD_EMPLOYEE_ID',
        inputPlaceholderKey: 'PEOPLE.LANDING.PLACEHOLDER.OFFBOARD_EMPLOYEE_ID',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_EMPLOYEE_OFFBOARD',
        buildCommands: value => ['/app', 'people', 'employees', value, 'offboard'],
      },
    ],
  },
  {
    titleKey: 'PEOPLE.LANDING.SECTION.ACCESS.TITLE',
    descriptionKey: 'PEOPLE.LANDING.SECTION.ACCESS.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'PEOPLE.LANDING.CARD.RBAC.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.RBAC.DESCRIPTION',
        routePattern: '/app/people/rbac/:personUuid',
        field: 'personUuid',
        inputLabelKey: 'PEOPLE.LANDING.FIELD.PERSON_UUID',
        inputPlaceholderKey: 'PEOPLE.LANDING.PLACEHOLDER.PERSON_UUID',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_RBAC',
        buildCommands: value => ['/app', 'people', 'rbac', value],
      },
      {
        kind: 'launch',
        titleKey: 'PEOPLE.LANDING.CARD.PERSON_LOCATIONS.TITLE',
        descriptionKey: 'PEOPLE.LANDING.CARD.PERSON_LOCATIONS.DESCRIPTION',
        routePattern: '/app/people/person/:personId/locations',
        field: 'personLocationId',
        inputLabelKey: 'PEOPLE.LANDING.FIELD.PERSON_ID',
        inputPlaceholderKey: 'PEOPLE.LANDING.PLACEHOLDER.PERSON_ID',
        actionKey: 'PEOPLE.LANDING.ACTION.OPEN_PERSON_LOCATIONS',
        buildCommands: value => ['/app', 'people', 'person', value, 'locations'],
      },
    ],
  },
] as const;

@Component({
  selector: 'app-people-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './people-landing-page.component.html',
  styleUrl: './people-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeopleLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    personUuid: '',
    sessionId: '',
    employeeProfileId: '',
    employeeOffboardId: '',
    personLocationId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});
  readonly sections = LANDING_SECTIONS;
  readonly directLinkCount = computed(() =>
    LANDING_SECTIONS.flatMap(section => section.cards).filter(card => card.kind === 'direct').length,
  );
  readonly guidedLinkCount = computed(() =>
    LANDING_SECTIONS.flatMap(section => section.cards).filter(card => card.kind === 'launch').length,
  );
  readonly totalPageCount = computed(() =>
    LANDING_SECTIONS.flatMap(section => section.cards).length,
  );

  isLaunchCard(card: DirectCard | LaunchCard): card is LaunchCard {
    return card.kind === 'launch';
  }

  updateLaunchValue(field: LaunchField, value: string): void {
    this.launchValues.update(current => ({ ...current, [field]: value }));
    this.launchErrors.update(current => ({ ...current, [field]: null }));
    this.errorKey.set(null);
    this.state.set('ready');
    this.activeLaunchField.set(null);
  }

  launchValue(field: LaunchField): string {
    return this.launchValues()[field] ?? '';
  }

  launchError(field: LaunchField): string | null {
    return this.launchErrors()[field] ?? null;
  }

  async openLaunch(card: LaunchCard): Promise<void> {
    const routeValue = this.launchValue(card.field).trim();
    if (!routeValue) {
      this.launchErrors.update(current => ({
        ...current,
        [card.field]: 'PEOPLE.LANDING.ERROR.REQUIRED_IDENTIFIER',
      }));
      return;
    }

    this.launchErrors.update(current => {
      const { [card.field]: _clearedError, ...remainingErrors } = current;
      return remainingErrors;
    });
    this.errorKey.set(null);
    this.state.set('loading');
    this.activeLaunchField.set(card.field);

    try {
      const navigated = await this.router.navigate(card.buildCommands(routeValue));
      if (!navigated) {
        this.state.set('error');
        this.errorKey.set('PEOPLE.LANDING.ERROR.NAVIGATE');
        return;
      }

      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('PEOPLE.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
