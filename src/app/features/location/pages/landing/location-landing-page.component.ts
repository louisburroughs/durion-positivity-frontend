import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { LOCATION_LANDING_CONFIG } from './location-landing.config';

@Component({
  selector: 'app-location-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationLandingPageComponent {
  readonly config = LOCATION_LANDING_CONFIG;
}
