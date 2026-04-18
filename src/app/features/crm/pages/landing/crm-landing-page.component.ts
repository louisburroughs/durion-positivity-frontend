import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type LaunchField =
  | 'partyDetailId'
  | 'addVehiclePartyId'
  | 'contactsPartyId'
  | 'billingRulesPartyId'
  | 'snapshotPartyId';
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

const DIRECTORY_CARDS: readonly DirectCard[] = [
  {
    kind: 'direct',
    titleKey: 'CRM.LANDING.CARD.CUSTOMER_LIST.TITLE',
    descriptionKey: 'CRM.LANDING.CARD.CUSTOMER_LIST.DESCRIPTION',
    route: '/app/crm/customers',
    actionKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'CRM.LANDING.CARD.CREATE_COMMERCIAL.TITLE',
    descriptionKey: 'CRM.LANDING.CARD.CREATE_COMMERCIAL.DESCRIPTION',
    route: '/app/crm/create-commercial-account',
    actionKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'CRM.LANDING.CARD.CREATE_INDIVIDUAL.TITLE',
    descriptionKey: 'CRM.LANDING.CARD.CREATE_INDIVIDUAL.DESCRIPTION',
    route: '/app/crm/create-individual-person',
    actionKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
  },
  {
    kind: 'direct',
    titleKey: 'CRM.LANDING.CARD.MERGE_PARTIES.TITLE',
    descriptionKey: 'CRM.LANDING.CARD.MERGE_PARTIES.DESCRIPTION',
    route: '/app/crm/merge-parties',
    actionKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
  },
] as const;

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'CRM.LANDING.SECTION.DIRECTORY.TITLE',
    descriptionKey: 'CRM.LANDING.SECTION.DIRECTORY.DESCRIPTION',
    cards: DIRECTORY_CARDS,
  },
  {
    titleKey: 'CRM.LANDING.SECTION.PARTY.TITLE',
    descriptionKey: 'CRM.LANDING.SECTION.PARTY.DESCRIPTION',
    cards: [
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.PARTY_DETAIL.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.PARTY_DETAIL.DESCRIPTION',
        field: 'partyDetailId',
        inputLabelKey: 'CRM.LANDING.FIELD.PARTY_DETAIL_ID',
        inputPlaceholderKey: 'CRM.LANDING.PLACEHOLDER.PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_PARTY',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value],
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.ADD_VEHICLE.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.ADD_VEHICLE.DESCRIPTION',
        field: 'addVehiclePartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.ADD_VEHICLE_PARTY_ID',
        inputPlaceholderKey: 'CRM.LANDING.PLACEHOLDER.PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_VEHICLE_FORM',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value, 'add-vehicle'],
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.PARTY_CONTACTS.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.PARTY_CONTACTS.DESCRIPTION',
        field: 'contactsPartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.CONTACTS_PARTY_ID',
        inputPlaceholderKey: 'CRM.LANDING.PLACEHOLDER.PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_CONTACTS',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value, 'contacts'],
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.BILLING_RULES.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.BILLING_RULES.DESCRIPTION',
        field: 'billingRulesPartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.BILLING_RULES_PARTY_ID',
        inputPlaceholderKey: 'CRM.LANDING.PLACEHOLDER.PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_BILLING_RULES',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value, 'billing-rules'],
      },
    ],
  },
  {
    titleKey: 'CRM.LANDING.SECTION.INSIGHTS.TITLE',
    descriptionKey: 'CRM.LANDING.SECTION.INSIGHTS.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT.DESCRIPTION',
        route: '/app/crm/snapshot',
        actionKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT_PARTY.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.CRM_SNAPSHOT_PARTY.DESCRIPTION',
        field: 'snapshotPartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.SNAPSHOT_PARTY_ID',
        inputPlaceholderKey: 'CRM.LANDING.PLACEHOLDER.PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_SNAPSHOT',
        buildCommands: (value: string) => ['/app', 'crm', 'crm-snapshot', value],
      },
      {
        kind: 'direct',
        titleKey: 'CRM.LANDING.CARD.INTEGRATION_EVENTS.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.INTEGRATION_EVENTS.DESCRIPTION',
        route: '/app/crm/integration/events',
        actionKey: 'CRM.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
] as const;

@Component({
  selector: 'app-crm-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './crm-landing-page.component.html',
  styleUrl: './crm-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmLandingPageComponent {
  private readonly router = inject(Router);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeLaunchField = signal<LaunchField | null>(null);
  readonly launchValues = signal<Record<LaunchField, string>>({
    partyDetailId: '',
    addVehiclePartyId: '',
    contactsPartyId: '',
    billingRulesPartyId: '',
    snapshotPartyId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  readonly sections = LANDING_SECTIONS;
  /** Route for the primary hero CTA - Customer Directory card */
  readonly heroCustomersRoute = DIRECTORY_CARDS[0].route;
  /** Route for the secondary hero CTA - Create Commercial Account card */
  readonly heroCreateCommercialRoute = DIRECTORY_CARDS[1].route;

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
        [card.field]: 'CRM.LANDING.ERROR.REQUIRED_IDENTIFIER',
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
        this.errorKey.set('CRM.LANDING.ERROR.NAVIGATE');
        return;
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.errorKey.set('CRM.LANDING.ERROR.NAVIGATE');
    } finally {
      this.activeLaunchField.set(null);
    }
  }
}
