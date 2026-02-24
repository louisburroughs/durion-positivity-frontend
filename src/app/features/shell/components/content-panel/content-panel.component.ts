import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * ContentPanelComponent
 * ----------------------
 * Bottom frame of the main column.
 * Hosts a <router-outlet> so future lazy-loaded domain modules can render here
 * under the /app/** route tree.
 *
 * TODO: Replace the placeholder with a proper landing/dashboard component
 *       once the first domain feature module is ready.
 */
@Component({
  selector: 'app-content-panel',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <section class="content-panel" aria-label="Content area">
      <router-outlet />
    </section>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .content-panel {
      flex: 1;
      overflow-y: auto;
      background: var(--themeBackground);
      padding: var(--space-4);
    }
  `],
})
export class ContentPanelComponent {}
