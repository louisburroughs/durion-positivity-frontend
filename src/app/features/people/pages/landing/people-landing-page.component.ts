import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PeopleAPIService, Person } from '@durion-sdk/people-contact';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { RecordHit, RecordSearchMap } from '../../../../shared/landing/landing.models';
import { PEOPLE_LANDING_CONFIG } from './people-landing.config';

@Component({
  selector: 'app-people-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" [searchFns]="searchFns" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeopleLandingPageComponent {
  private readonly peopleApi = inject(PeopleAPIService);

  readonly config = PEOPLE_LANDING_CONFIG;

  /** Directory search scoped to employees (excludes non-employee persons). */
  private readonly employeeSearch = (q: string): Observable<RecordHit[]> =>
    this.peopleApi.listPeople(q).pipe(map(people => this.toHits(people)));

  /** Directory search across all persons (RBAC + location assignments by person UUID). */
  private readonly personSearch = (q: string): Observable<RecordHit[]> =>
    this.peopleApi.listPeople(q).pipe(map(people => this.toHits(people)));

  readonly searchFns: RecordSearchMap = {
    employee: this.employeeSearch,
    person: this.personSearch,
  };

  private toHits(people: readonly Person[]): RecordHit[] {
    return (people ?? [])
      .filter(p => !!p.id)
      .map(p => ({
        id: p.id as string,
        primary: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || (p.id as string),
        secondary: p.primaryEmail,
      }));
  }
}
