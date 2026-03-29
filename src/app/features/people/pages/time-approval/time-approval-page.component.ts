import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-time-approval-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './time-approval-page.component.html',
  styleUrl: './time-approval-page.component.css',
})
export class TimeApprovalPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);

  readonly loading = signal(false);
  readonly timeEntries = signal<unknown[]>([]);
  readonly selectedEntries = signal<string[]>([]);
  readonly approveSuccess = signal(false);
  readonly approveError = signal<string | null>(null);
  readonly rejectLoading = signal(false);
  readonly rejectSuccess = signal(false);
  readonly rejectError = signal<string | null>(null);
  readonly rejectReason = signal('');
  readonly showRejectModal = signal(false);

  ngOnInit(): void {
    this.loadEntries();
  }

  loadEntries(): void {
    this.loading.set(true);
    this.peopleService.listPendingTimeEntries().subscribe({
      next: (entries) => {
        this.timeEntries.set(Array.isArray(entries) ? entries : []);
        this.loading.set(false);
      },
      error: () => {
        this.timeEntries.set([]);
        this.approveError.set('PEOPLE.TIME_APPROVAL.ERROR.LOAD');
        this.loading.set(false);
      },
    });
  }

  toggleEntry(id: string): void {
    const current = this.selectedEntries();
    if (current.includes(id)) {
      this.selectedEntries.set(current.filter(entryId => entryId !== id));
      return;
    }
    this.selectedEntries.set([...current, id]);
  }

  approveSelected(): void {
    this.approveSuccess.set(false);
    this.approveError.set(null);
    this.peopleService.approveTimeEntries({ timeEntryIds: this.selectedEntries() }).subscribe({
      next: () => {
        this.approveSuccess.set(true);
      },
      error: () => {
        this.approveError.set('PEOPLE.TIME_APPROVAL.ERROR.APPROVE');
      },
    });
  }

  openRejectModal(): void {
    this.showRejectModal.set(true);
    this.rejectError.set(null);
    this.rejectSuccess.set(false);
  }

  closeRejectModal(): void {
    this.showRejectModal.set(false);
    this.rejectReason.set('');
  }

  submitReject(): void {
    this.rejectLoading.set(true);
    this.rejectError.set(null);
    this.rejectSuccess.set(false);

    this.peopleService.rejectTimeEntries({
      timeEntryIds: this.selectedEntries(),
      reason: this.rejectReason(),
    }).subscribe({
      next: () => {
        this.rejectLoading.set(false);
        this.rejectSuccess.set(true);
        this.closeRejectModal();
      },
      error: () => {
        this.rejectLoading.set(false);
        this.rejectError.set('PEOPLE.TIME_APPROVAL.ERROR.REJECT');
      },
    });
  }

  createAdjustment(entryId: string, body: Record<string, unknown>): void {
    this.peopleService.createAdjustment({ ...body, timeEntryId: entryId }).subscribe({
      next: () => { },
      error: () => {
        this.approveError.set('PEOPLE.TIME_APPROVAL.ERROR.ADJUSTMENT');
      },
    });
  }

  getEntryId(entry: unknown): string {
    const candidate = entry as Record<string, unknown>;
    return String(candidate['timeEntryId'] ?? candidate['id'] ?? candidate['personId'] ?? '');
  }
}
