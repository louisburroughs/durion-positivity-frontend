import { Component } from '@angular/core';

@Component({
  selector: 'app-admin',
  standalone: true,
  template: `
    <section class="admin-page" aria-label="Admin page">
      <h2>Admin Screen</h2>
      <p>
        This route is protected by <strong>ROLE_ADMIN</strong> using route metadata and
        <code>rolesChildGuard</code>.
      </p>
    </section>
  `,
  styles: [
    `
      .admin-page {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-4);
      }

      h2 {
        margin: 0;
        color: var(--currentTextColor);
      }

      p {
        margin: 0;
        color: var(--handleColor);
      }

      code {
        background: var(--primary50);
        color: var(--brand-primary);
        padding: 1px 4px;
        border-radius: var(--radius-sm);
      }
    `,
  ],
})
export class AdminComponent {}
