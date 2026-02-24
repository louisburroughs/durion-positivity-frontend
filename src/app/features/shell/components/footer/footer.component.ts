import { Component } from '@angular/core';

@Component({
  selector: 'app-shell-footer',
  standalone: true,
  template: `
    <footer class="shell-footer" role="contentinfo">
      <span>© {{ year }} Durion POS – Positivity Platform</span>
    </footer>
  `,
  styles: [`
    :host { display: block; }
    .shell-footer {
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--navBackground);
      color: rgba(255,255,255,0.5);
      font-size: 0.75rem;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
  `],
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
}
