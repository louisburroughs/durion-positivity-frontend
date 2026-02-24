import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService } from './core/services/theme.service';

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

  ngOnInit(): void {
    // Eagerly apply the persisted theme on the browser so there's no flash.
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.dataset['theme'] = this.themeService.theme();
    }
  }
}
