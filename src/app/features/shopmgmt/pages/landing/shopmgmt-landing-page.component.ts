import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { SHOPMGMT_LANDING_CONFIG } from './shopmgmt-landing.config';

@Component({
  selector: 'app-shopmgmt-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopmgmtLandingPageComponent {
  readonly config = SHOPMGMT_LANDING_CONFIG;
}
