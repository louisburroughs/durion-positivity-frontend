import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from './core/services/theme.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * Root application component.
 * Its only job is to host <router-outlet> and bootstrap the ThemeService
 * so the `data-theme` attribute is applied to <html> before any route renders.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`:host { display: block; height: 100%; }`],
})
export class App implements OnInit {
  private readonly themeService = inject(ThemeService);
  private readonly platformId   = inject(PLATFORM_ID);
  private readonly translate = inject(TranslateService);

  constructor() {
    this.translate.addLangs(['en-US', 'es-US', 'fr-CA']);
    this.translate.setDefaultLang('en-US');

    const browserLang = this.translate.getBrowserLang();
    this.translate.use(browserLang?.match(/en-US|es-US|fr-CA/) ? browserLang : 'en-US');
  }

  ngOnInit(): void {
    // Eagerly apply the persisted theme on the browser so there's no flash.
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.dataset['theme'] = this.themeService.theme();
    }
  }
}
