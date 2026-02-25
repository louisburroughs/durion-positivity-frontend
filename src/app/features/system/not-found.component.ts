import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <section class="state-page" aria-label="Not found">
      <h1>{{ 'SYSTEM.NOT_FOUND.TITLE' | translate }}</h1>
      <p>{{ 'SYSTEM.NOT_FOUND.MESSAGE' | translate }}</p>
      <button class="state-btn" type="button" (click)="goBack()">{{ 'SYSTEM.NOT_FOUND.BACK' | translate }}</button>
      <a class="state-link" routerLink="/app">{{ 'SYSTEM.NOT_FOUND.HOME' | translate }}</a>
    </section>
  `,
  styles: [
    `
      .state-page {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-6);
        text-align: center;
      }

      h1 {
        margin: 0;
        color: var(--currentTextColor);
      }

      p {
        margin: 0;
        color: var(--handleColor);
      }

      .state-btn {
        border: 1px solid var(--border-color);
        background: var(--cardBackground);
        color: var(--currentTextColor);
        border-radius: var(--radius-md);
        padding: var(--space-2) var(--space-4);
        cursor: pointer;
      }

      .state-btn:hover {
        background: var(--primary50);
      }

      .state-link {
        color: var(--brand-primary);
        text-decoration: none;
        font-weight: 600;
      }
    `,
  ],
})
export class NotFoundComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  goBack(): void {
    if (globalThis.window !== undefined && globalThis.window.history.length > 1) {
      this.location.back();
      return;
    }
    void this.router.navigateByUrl('/app');
  }
}
