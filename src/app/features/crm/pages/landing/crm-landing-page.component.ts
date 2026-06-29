import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { RecordHit, RecordSearchMap } from '../../../../shared/landing/landing.models';
import { PartyDetail } from '../../models/crm.models';
import { CrmService } from '../../services/crm.service';
import { CRM_LANDING_CONFIG } from './crm-landing.config';

@Component({
  selector: 'app-crm-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" [searchFns]="searchFns" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmLandingPageComponent {
  private readonly crm = inject(CrmService);

  readonly config = CRM_LANDING_CONFIG;

  /** Adapt a party to a finder hit: id = party UUID, primary = name, secondary = customer #. */
  private readonly customerSearch = (q: string): Observable<RecordHit[]> =>
    this.crm.searchParties(q).pipe(map(res => res.parties.map(p => this.toHit(p))));

  readonly searchFns: RecordSearchMap = {
    customer: this.customerSearch,
  };

  private toHit(party: PartyDetail): RecordHit {
    const name = party.legalName?.trim() || party.dba?.trim() || party.partyId;
    return {
      id: party.partyId,
      primary: name,
      secondary: party.customerNumber ? `#${party.customerNumber}` : undefined,
      tertiary: party.status,
    };
  }
}
