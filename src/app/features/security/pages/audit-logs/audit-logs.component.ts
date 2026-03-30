import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  AuditEventDetail,
  AuditEventFilter,
  AuditEventPageResponse,
  AuditExportJob,
} from '../../models/security-audit.models';
import { SecurityAuditService } from '../../services/security-audit.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './audit-logs.component.html',
  styleUrl: './audit-logs.component.css',
})
export class AuditLogsComponent {
  private readonly auditService = inject(SecurityAuditService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly events = signal<AuditEventDetail[]>([]);
  readonly nextPageToken = signal<string | null>(null);
  readonly exportJob = signal<AuditExportJob | null>(null);
  readonly selectedEvent = signal<AuditEventDetail | null>(null);
  readonly filter = signal<Partial<AuditEventFilter>>({});

  search(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    this.events.set([]);
    this.nextPageToken.set(null);

    this.auditService
      .searchAuditEvents(this.filter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: AuditEventPageResponse) => {
          this.events.set(resp.items);
          this.nextPageToken.set(resp.nextPageToken ?? null);
          this.state.set(resp.items.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SECURITY.AUDIT_LOGS.ERROR.LOAD');
        },
      });
  }

  loadMore(): void {
    const token = this.nextPageToken();
    if (!token) return;

    this.auditService
      .searchAuditEvents({ ...this.filter(), pageToken: token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: AuditEventPageResponse) => {
          this.events.update(current => [...current, ...resp.items]);
          this.nextPageToken.set(resp.nextPageToken ?? null);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SECURITY.AUDIT_LOGS.ERROR.LOAD_MORE');
        },
      });
  }

  selectEvent(evt: AuditEventDetail): void {
    this.selectedEvent.set(evt);
  }

  requestExport(): void {
    this.exportJob.set(null);

    this.auditService
      .requestAuditExport(this.filter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: job => {
          this.exportJob.set(job);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SECURITY.AUDIT_LOGS.ERROR.EXPORT');
        },
      });
  }

  updateFilter(partial: Partial<AuditEventFilter>): void {
    this.filter.update(current => ({ ...current, ...partial }));
  }
}
