import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { PRODUCT_LANDING_CONFIG } from './product-landing.config';

@Component({
  selector: 'app-product-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductLandingPageComponent {
  readonly config = PRODUCT_LANDING_CONFIG;
}
