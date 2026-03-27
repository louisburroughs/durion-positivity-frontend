import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-security-audit-list-page',
  standalone: true,
  templateUrl: './security-audit-list-page.component.html',
  styleUrl: './security-audit-list-page.component.css',
})
export class SecurityAuditListPageComponent {
  readonly state = signal<'coming-soon'>('coming-soon');
}
