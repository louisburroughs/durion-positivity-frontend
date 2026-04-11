import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * ContentPanelComponent
 * ----------------------
 * Bottom frame of the main column.
 * Hosts a <router-outlet> so future lazy-loaded domain modules can render here
 * under the /app/** route tree.
 */
@Component({
  selector: 'app-content-panel',
  standalone: true,
  imports: [RouterOutlet, TranslatePipe],
  templateUrl: './content-panel.component.html',
  styleUrl: './content-panel.component.css',
})
export class ContentPanelComponent {}
