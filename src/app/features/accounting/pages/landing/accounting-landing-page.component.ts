import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { ACCOUNTING_LANDING_CONFIG } from './accounting-landing.config';

@Component({
  selector: 'app-accounting-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingLandingPageComponent {
  readonly config = ACCOUNTING_LANDING_CONFIG;
}
