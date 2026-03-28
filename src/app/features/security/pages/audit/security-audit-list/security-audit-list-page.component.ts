import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SecurityService } from '../../../services/security.service';

@Component({
  selector: 'app-security-audit-list-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './security-audit-list-page.component.html',
  styleUrl: './security-audit-list-page.component.css',
})
export class SecurityAuditListPageComponent implements OnInit {
  private readonly securityService = inject(SecurityService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly auditEntries = signal<unknown[]>([]);
  readonly error = signal<string | null>(null);
  readonly appointmentId = signal('');
  readonly selectedEntry = signal<Record<string, unknown> | null>(null);

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const appointmentId = String(params['appointmentId'] ?? '');
      this.appointmentId.set(appointmentId);
      if (appointmentId) {
        this.loadAudit(appointmentId);
      }
    });
  }

  loadAudit(id: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.securityService.searchAudit(id).subscribe({
      next: (entries) => {
        this.auditEntries.set(Array.isArray(entries) ? entries : []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load audit entries.');
        this.auditEntries.set([]);
        this.loading.set(false);
      },
    });
  }

  viewEntry(entry: unknown): void {
    const candidate = entry as Record<string, unknown>;
    this.selectedEntry.set(candidate);
  }
}
