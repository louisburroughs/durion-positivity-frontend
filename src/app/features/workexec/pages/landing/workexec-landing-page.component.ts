import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { RecordSearchMap } from '../../../../shared/landing/landing.models';
import { SearchResultItem } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WORKEXEC_LANDING_CONFIG } from './workexec-landing.config';

@Component({
  selector: 'app-workexec-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" [searchFns]="searchFns" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkexecLandingPageComponent {
  private readonly workexec = inject(WorkexecService);

  readonly config = WORKEXEC_LANDING_CONFIG;

  private readonly estimateSearch = (q: string): Observable<SearchResultItem[]> =>
    this.workexec.searchEstimates(q);
  private readonly workorderSearch = (q: string): Observable<SearchResultItem[]> =>
    this.workexec.searchWorkorders(q);

  readonly searchFns: RecordSearchMap = {
    estimate: this.estimateSearch,
    workorder: this.workorderSearch,
  };
}
