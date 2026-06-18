import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { DomainType } from '../../../bulk-import/models/bulk-import.models';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';

const MAX_SUGGESTIONS = 8;

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
  readonly domainType?: DomainType;
}

interface LaunchCard {
  readonly kind: 'launch';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly field: LaunchField;
  readonly inputLabelKey: string;
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
        actionKey: 'CRM.LANDING.ACTION.OPEN_PARTY',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value],
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.ADD_VEHICLE.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.ADD_VEHICLE.DESCRIPTION',
        field: 'addVehiclePartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.ADD_VEHICLE_PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_VEHICLE_FORM',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value, 'add-vehicle'],
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.PARTY_CONTACTS.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.PARTY_CONTACTS.DESCRIPTION',
        field: 'contactsPartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.CONTACTS_PARTY_ID',
        actionKey: 'CRM.LANDING.ACTION.OPEN_CONTACTS',
        buildCommands: (value: string) => ['/app', 'crm', 'party', value, 'contacts'],
      },
      {
        kind: 'launch',
        titleKey: 'CRM.LANDING.CARD.BILLING_RULES.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.BILLING_RULES.DESCRIPTION',
        field: 'billingRulesPartyId',
        inputLabelKey: 'CRM.LANDING.FIELD.BILLING_RULES_PARTY_ID',
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
  {
    titleKey: 'CRM.LANDING.SECTION.DATA_IMPORT.TITLE',
    descriptionKey: 'CRM.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'CRM.LANDING.CARD.IMPORT_CUSTOMER.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.IMPORT_CUSTOMER.DESCRIPTION',
        route: '/app/crm/bulk-import/customer',
        actionKey: 'CRM.LANDING.ACTION.IMPORT_DATA',
        domainType: 'CUSTOMER',
      },
      {
        kind: 'direct',
        titleKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_INVENTORY.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_INVENTORY.DESCRIPTION',
        route: '/app/crm/bulk-import/vehicle-inventory',
        actionKey: 'CRM.LANDING.ACTION.IMPORT_DATA',
        domainType: 'VEHICLE_INVENTORY',
      },
      {
        kind: 'direct',
        titleKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_FITMENT.TITLE',
        descriptionKey: 'CRM.LANDING.CARD.IMPORT_VEHICLE_FITMENT.DESCRIPTION',
        route: '/app/crm/bulk-import/vehicle-fitment',
        actionKey: 'CRM.LANDING.ACTION.IMPORT_DATA',
        domainType: 'VEHICLE_FITMENT',
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
export class CrmLandingPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly bulkImportService = inject(BulkImportService, { optional: true });
  private readonly crm = inject(CrmService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);
  readonly activeImportDomains = signal<Set<DomainType>>(new Set());
  readonly activeLaunchField = signal<LaunchField | null>(null);
  /** Resolved party UUID per launch field, set when a customer is picked from the typeahead. */
  readonly launchValues = signal<Record<LaunchField, string>>({
    partyDetailId: '',
    addVehiclePartyId: '',
    contactsPartyId: '',
    billingRulesPartyId: '',
    snapshotPartyId: '',
  });
  readonly launchErrors = signal<Partial<Record<LaunchField, string>>>({});

  /** Text shown in each typeahead input (customer name, not the UUID). */
  readonly launchQueries = signal<Record<LaunchField, string>>({
    partyDetailId: '',
    addVehiclePartyId: '',
    contactsPartyId: '',
    billingRulesPartyId: '',
    snapshotPartyId: '',
  });
  readonly suggestions = signal<Partial<Record<LaunchField, PartyDetail[]>>>({});
  readonly searchingField = signal<LaunchField | null>(null);
  readonly openField = signal<LaunchField | null>(null);
  private readonly customerSearch$ = new Subject<{ field: LaunchField; query: string }>();

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

  constructor() {
    this.customerSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.field === b.field && a.query === b.query),
        switchMap(({ field, query }) => {
          if (query.trim().length < 2) {
            return of({ field, parties: [] as PartyDetail[] });
          }
          this.searchingField.set(field);
          return this.crm.searchParties(query).pipe(
            map(res => ({ field, parties: res.parties.slice(0, MAX_SUGGESTIONS) })),
            catchError(() => of({ field, parties: [] as PartyDetail[] })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ field, parties }) => {
        this.suggestions.update(prev => ({ ...prev, [field]: parties }));
        if (this.searchingField() === field) {
          this.searchingField.set(null);
        }
      });
  }

  ngOnInit(): void {
    this.loadActiveImportDomains();
  }

  isLaunchCard(card: DirectCard | LaunchCard): card is LaunchCard {
    return card.kind === 'launch';
  }

  /** Suggestions currently available for a launch field. */
  customerSuggestions(field: LaunchField): PartyDetail[] {
    return this.suggestions()[field] ?? [];
  }

  isFieldOpen(field: LaunchField): boolean {
    return this.openField() === field;
  }

  /** Human-readable label for a party suggestion: legal name plus customer number when present. */
  customerLabel(party: PartyDetail): string {
    const name = party.legalName?.trim() || party.dba?.trim() || party.partyId;
    return party.customerNumber ? `${name} (#${party.customerNumber})` : name;
  }

  onCustomerInput(field: LaunchField, value: string): void {
    this.launchQueries.update(prev => ({ ...prev, [field]: value }));
    // Typing invalidates any previously resolved party until a new one is picked.
    this.updateLaunchValue(field, '');
    this.openField.set(field);
    this.customerSearch$.next({ field, query: value });
  }

  onCustomerFocus(field: LaunchField): void {
    if (this.customerSuggestions(field).length > 0) {
      this.openField.set(field);
    }
  }

  onCustomerBlur(field: LaunchField): void {
    // Delay so a suggestion click registers before the list closes.
    setTimeout(() => {
      if (this.openField() === field) {
        this.openField.set(null);
      }
    }, 150);
  }

  selectCustomer(field: LaunchField, party: PartyDetail): void {
    this.updateLaunchValue(field, party.partyId);
    this.launchQueries.update(prev => ({ ...prev, [field]: this.customerLabel(party) }));
    this.openField.set(null);
  }

  launchQuery(field: LaunchField): string {
    return this.launchQueries()[field];
  }

  isActiveImport(card: DirectCard | LaunchCard): boolean {
    return card.kind === 'direct'
      && !!card.domainType
      && this.activeImportDomains().has(card.domainType);
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

  private loadActiveImportDomains(): void {
    if (!this.bulkImportService) {
      return;
    }

    this.bulkImportService.getActiveJobDomains()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: domains => this.activeImportDomains.set(domains),
      });
  }
}
