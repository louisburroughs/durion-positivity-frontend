import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ThemeService } from '../../../../core/services/theme.service';
import { AuthService }  from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';

@Component({
  selector: 'app-shell-header',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly authService  = inject(AuthService);
  readonly localeService = inject(LocaleService);
  readonly localeOptions = [
    { code: 'en-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.EN_US' },
    { code: 'es-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.ES_US' },
    { code: 'fr-CA', labelKey: 'SHELL.HEADER.LOCALE.OPTION.FR_CA' },
  ] as const;

  /** Emitted when the hamburger button is clicked (mobile nav toggle). */
  readonly navToggle = output<void>();

  toggleNav(): void {
    this.navToggle.emit();
  }

  logout(): void {
    this.authService.logout();
  }

  setLocale(locale: string): void {
    void this.localeService.setLocale(locale);
  }

  get username(): string {
    return this.authService.currentUserClaims()?.sub ?? 'User';
  }
}
