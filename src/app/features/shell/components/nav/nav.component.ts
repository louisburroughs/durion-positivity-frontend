import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NavigationRegistryService } from '../../services/navigation-registry.service';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { IconFontService } from '../../../../core/services/icon-font.service';
@Component({
  selector: 'app-shell-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe, MaterialSymbolPipe],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.css',
})
export class NavComponent {
  readonly collapsed = input(false);
  readonly navId = input('shell-nav');

  private readonly navRegistryService = inject(NavigationRegistryService);
  readonly navItems = this.navRegistryService.visibleNavItems;

  /** Glyph renders only once the icon font is usable; otherwise a letter. */
  readonly iconFontReady = inject(IconFontService).ready;
}
