import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleService } from '../../core/services/locale.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
})
export class LandingPageComponent {
  readonly localeService = inject(LocaleService);
  readonly themeService = inject(ThemeService);

  readonly localeOptions = [
    { code: 'en-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.EN_US' },
    { code: 'es-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.ES_US' },
    { code: 'fr-CA', labelKey: 'SHELL.HEADER.LOCALE.OPTION.FR_CA' },
  ] as const;

  readonly features = [
    {
      icon: 'landing-icon-customers',
      titleKey: 'LANDING.FEATURE_CUSTOMERS_TITLE',
      descKey: 'LANDING.FEATURE_CUSTOMERS_DESC',
    },
    {
      icon: 'landing-icon-workorders',
      titleKey: 'LANDING.FEATURE_WORKORDERS_TITLE',
      descKey: 'LANDING.FEATURE_WORKORDERS_DESC',
    },
    {
      icon: 'landing-icon-billing',
      titleKey: 'LANDING.FEATURE_BILLING_TITLE',
      descKey: 'LANDING.FEATURE_BILLING_DESC',
    },
    {
      icon: 'landing-icon-inventory',
      titleKey: 'LANDING.FEATURE_INVENTORY_TITLE',
      descKey: 'LANDING.FEATURE_INVENTORY_DESC',
    },
    {
      icon: 'landing-icon-finances',
      titleKey: 'LANDING.FEATURE_FINANCES_TITLE',
      descKey: 'LANDING.FEATURE_FINANCES_DESC',
    },
    {
      icon: 'landing-icon-team',
      titleKey: 'LANDING.FEATURE_TEAM_TITLE',
      descKey: 'LANDING.FEATURE_TEAM_DESC',
    },
    {
      icon: 'landing-icon-locations',
      titleKey: 'LANDING.FEATURE_LOCATIONS_TITLE',
      descKey: 'LANDING.FEATURE_LOCATIONS_DESC',
    },
    {
      icon: 'landing-icon-reports',
      titleKey: 'LANDING.FEATURE_REPORTS_TITLE',
      descKey: 'LANDING.FEATURE_REPORTS_DESC',
    },
  ] as const;

  setLocale(locale: string): void {
    void this.localeService.setLocale(locale);
  }
}
