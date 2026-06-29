import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LandingPageComponent } from '../../../../shared/landing/landing-page/landing-page.component';
import { INVENTORY_LANDING_CONFIG } from './inventory-landing.config';

@Component({
  selector: 'app-inventory-landing-page',
  standalone: true,
  imports: [LandingPageComponent],
  template: `<app-landing-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryLandingPageComponent {
  readonly config = INVENTORY_LANDING_CONFIG;
}
