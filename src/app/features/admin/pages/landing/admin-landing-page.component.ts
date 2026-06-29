import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { ADMIN_LANDING_CONFIG } from './admin-landing.config';

@Component({
  selector: 'app-admin-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLandingPageComponent {
  readonly config = ADMIN_LANDING_CONFIG;
}
