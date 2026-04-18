import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField = 'roleName';
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

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'ADMIN.LANDING.SECTION.ROLES.TITLE',
    descriptionKey: 'ADMIN.LANDING.SECTION.ROLES.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ADMIN.LANDING.CARD.ROLES_LIST.TITLE',
        descriptionKey: 'ADMIN.LANDING.CARD.ROLES_LIST.DESCRIPTION',
        route: '/app/security',
        actionKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'ADMIN.LANDING.CARD.PERMISSIONS_LIST.TITLE',
        descriptionKey: 'ADMIN.LANDING.CARD.PERMISSIONS_LIST.DESCRIPTION',
        route: '/app/security/permissions',
        actionKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'ADMIN.LANDING.CARD.ROLE_DETAIL.TITLE',
        descriptionKey: 'ADMIN.LANDING.CARD.ROLE_DETAIL.DESCRIPTION',
        field: 'roleName',
        inputLabelKey: 'ADMIN.LANDING.FIELD.ROLE_NAME',
        inputPlaceholderKey: 'ADMIN.LANDING.PLACEHOLDER.ROLE_NAME',
        actionKey: 'ADMIN.LANDING.ACTION.OPEN_ROLE',
        buildCommands: (value: string) => ['/app', 'security', 'roles', value],
      },
    ],
  },
  {
    titleKey: 'ADMIN.LANDING.SECTION.USERS.TITLE',
    descriptionKey: 'ADMIN.LANDING.SECTION.USERS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ADMIN.LANDING.CARD.USER_PROVISION.TITLE',
        descriptionKey: 'ADMIN.LANDING.CARD.USER_PROVISION.DESCRIPTION',
        route: '/app/security/users/provision',
        actionKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'ADMIN.LANDING.SECTION.AUDIT.TITLE',
    descriptionKey: 'ADMIN.LANDING.SECTION.AUDIT.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'ADMIN.LANDING.CARD.SECURITY_AUDIT.TITLE',
        descriptionKey: 'ADMIN.LANDING.CARD.SECURITY_AUDIT.DESCRIPTION',
        route: '/app/security/audit',
        actionKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'ADMIN.LANDING.CARD.AUDIT_LOGS.TITLE',
        descriptionKey: 'ADMIN.LANDING.CARD.AUDIT_LOGS.DESCRIPTION',
        route: '/app/security/audit-logs',
        actionKey: 'ADMIN.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
];

@Component({
  selector: 'app-admin-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './admin-landing-page.component.html',
  styleUrl: './admin-landing-page.component.css',
})
export class AdminLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    roleName: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;

  readonly directLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(c => c.kind === 'direct').length;
  readonly guidedLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).filter(c => c.kind === 'launch').length;
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
        [card.field]: 'ADMIN.LANDING.ERROR.REQUIRED_IDENTIFIER',
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
        this.errorKey.set('ADMIN.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('ADMIN.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
