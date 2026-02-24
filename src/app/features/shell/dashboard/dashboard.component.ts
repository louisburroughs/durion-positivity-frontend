import { Component } from '@angular/core';

/**
 * DashboardComponent
 * ------------------
 * Placeholder landing page rendered in the Content Panel.
 * Replace with a real dashboard once domain data is available.
 *
 * TODO: Implement with real KPI widgets / domain summary cards.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="dashboard-placeholder">
      <h2>Welcome to Durion POS</h2>
      <p>
        This content area hosts routed domain feature modules.<br />
        Add your first domain module under <code>/app/:domain</code> and register it in
        <code>app.routes.ts</code> as a lazy-loaded child of the shell.
      </p>
      <div class="placeholder-cards">
        <div class="placeholder-card mic-elevation-1">
          <span class="card-icon" aria-hidden="true">🧾</span>
          <span>Orders</span>
        </div>
        <div class="placeholder-card mic-elevation-1">
          <span class="card-icon" aria-hidden="true">📦</span>
          <span>Inventory</span>
        </div>
        <div class="placeholder-card mic-elevation-1">
          <span class="card-icon" aria-hidden="true">📊</span>
          <span>Reports</span>
        </div>
        <div class="placeholder-card mic-elevation-1">
          <span class="card-icon" aria-hidden="true">⚙️</span>
          <span>Settings</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-placeholder {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      padding: var(--space-4);
    }
    h2 {
      font-family: var(--font-primary);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--currentTextColor);
    }
    p {
      color: var(--handleColor);
      font-size: 0.9375rem;
      line-height: 1.6;
    }
    code {
      background: var(--primary50);
      color: var(--brand-primary);
      padding: 1px 4px;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
    }
    .placeholder-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--space-4);
    }
    .placeholder-card {
      background: var(--cardBackground);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--space-6) var(--space-4);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--currentTextColor);
      cursor: pointer;
      transition: background var(--transition-fast), box-shadow var(--transition-fast);
    }
    .placeholder-card:hover {
      background: var(--primary50);
    }
    .card-icon { font-size: 1.75rem; }
  `],
})
export class DashboardComponent {}
