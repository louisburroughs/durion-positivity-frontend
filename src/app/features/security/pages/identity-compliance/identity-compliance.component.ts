import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { IdentityComplianceFinding, PersonStatus } from '../../models/identity-compliance.models';
import { IdentityComplianceService } from '../../services/identity-compliance.service';

type PageState = 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-identity-compliance',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './identity-compliance.component.html',
  styleUrl: './identity-compliance.component.css',
})
export class IdentityComplianceComponent implements OnInit {
  private readonly complianceService = inject(IdentityComplianceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly findings = signal<IdentityComplianceFinding[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.complianceService
      .findActiveUsersForInactivePersons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: results => {
          const findings = Array.isArray(results) ? results : [];
          this.findings.set(findings);
          this.state.set(findings.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SECURITY.IDENTITY_COMPLIANCE.ERROR.LOAD');
        },
      });
  }

  /** Maps a person status to a badge severity modifier class. */
  badgeClass(status: PersonStatus): string {
    switch (status as string) {
      case 'TERMINATED':
      case 'DISABLED':
        return 'badge--error';
      case 'SUSPENDED':
        return 'badge--warning';
      default:
        return 'badge--neutral';
    }
  }
}
