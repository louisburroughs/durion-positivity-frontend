import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../../core/services/theme.service';
import { AuthService }  from '../../../../core/services/auth.service';

@Component({
  selector: 'app-shell-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly authService  = inject(AuthService);

  /** Emitted when the hamburger button is clicked (mobile nav toggle). */
  readonly navToggle = output<void>();

  toggleNav(): void {
    this.navToggle.emit();
  }

  logout(): void {
    this.authService.logout();
  }

  get username(): string {
    return this.authService.currentUserClaims()?.sub ?? 'User';
  }
}
