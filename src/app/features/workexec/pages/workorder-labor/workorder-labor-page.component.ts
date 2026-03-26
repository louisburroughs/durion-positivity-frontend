import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateLaborPerformedRequest,
  StartLaborRequest,
  WorkorderDetailResponse,
  WorkorderItemResponse,
  WorkorderLaborEntryResponse,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';

/**
 * WorkorderLaborPageComponent — Story 223 (CAP-005)
 * Route: /app/workexec/workorders/:workorderId/labor
 * operationIds: startLaborSession, stopLaborSession, createLaborPerformed, getLaborHistory
 */
@Component({
  selector: 'app-workorder-labor-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workorder-labor-page.component.html',
  styleUrl: './workorder-labor-page.component.css',
})
export class WorkorderLaborPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workorderId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly workorder = signal<WorkorderDetailResponse | null>(null);
  readonly laborHistory = signal<WorkorderLaborEntryResponse[]>([]);
  readonly errorMessage = signal<string | null>(null);

  /** Active labor session tracking */
  readonly activeSession = signal<WorkorderLaborEntryResponse | null>(null);
  readonly sessionState = signal<'idle' | 'starting' | 'active' | 'stopping' | 'error'>('idle');
  readonly sessionError = signal<string | null>(null);

  /** Manual labor entry form */
  readonly showManualForm = signal(false);
  readonly manualServiceId = signal<string>('');
  readonly manualDescription = signal<string>('');
  readonly manualHours = signal<number>(0);
  readonly manualLaborCode = signal<string>('');
  readonly manualFlatRate = signal<boolean>(false);
  readonly manualState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly manualError = signal<string | null>(null);

  /** Selected service line for session start */
  readonly selectedServiceId = signal<string>('');

  readonly serviceItems = computed(() =>
    this.workorder()?.items?.filter(i => i.itemType === 'LABOR') ?? [],
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('workorderId') ?? '';
    this.workorderId.set(id);
    this.loadData(id);
  }

  private loadData(id: string): void {
    this.pageState.set('loading');
    this.service
      .getWorkorderDetail(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.workorder.set(detail);
          this.loadHistory(id);
        },
        error: () => {
          this.errorMessage.set('Failed to load work order.');
          this.pageState.set('error');
        },
      });
  }

  private loadHistory(id: string): void {
    this.service
      .getLaborHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entries) => {
          this.laborHistory.set(entries ?? []);
          this.pageState.set('ready');
        },
        error: () => this.pageState.set('ready'),
      });
  }

  startSession(): void {
    const id = this.workorderId();
    const serviceId = this.selectedServiceId();
    if (!serviceId) {
      this.sessionError.set('Select a labor service line to start a session.');
      return;
    }
    this.sessionState.set('starting');
    this.sessionError.set(null);
    const request: StartLaborRequest = { workorderServiceId: serviceId };
    this.service
      .startLaborSession(id, serviceId, request, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.activeSession.set(entry);
          this.sessionState.set('active');
        },
        error: (err) => {
          this.sessionState.set('error');
          this.sessionError.set(err?.error?.message ?? 'Failed to start labor session.');
        },
      });
  }

  stopSession(): void {
    const session = this.activeSession();
    if (!session?.id) return;
    this.sessionState.set('stopping');
    this.service
      .stopLaborSession(this.workorderId(), session.id, { stopTime: new Date().toISOString() }, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.activeSession.set(null);
          this.sessionState.set('idle');
          this.laborHistory.update(h => [entry, ...h]);
        },
        error: (err) => {
          this.sessionState.set('error');
          this.sessionError.set(err?.error?.message ?? 'Failed to stop labor session.');
        },
      });
  }

  submitManualEntry(): void {
    const id = this.workorderId();
    if (this.manualHours() <= 0) {
      this.manualError.set('Hours must be greater than 0.');
      return;
    }
    this.manualState.set('loading');
    this.manualError.set(null);
    const request: CreateLaborPerformedRequest = {
      workorderId: id,
      workorderServiceId: this.manualServiceId() || undefined,
      hoursWorked: this.manualHours(),
      laborCode: this.manualLaborCode() || undefined,
      description: this.manualDescription() || undefined,
      flatRate: this.manualFlatRate(),
    };
    this.service
      .createLaborPerformed(request, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.laborHistory.update(h => [entry, ...h]);
          this.manualState.set('idle');
          this.showManualForm.set(false);
          this.resetManualForm();
        },
        error: (err) => {
          this.manualState.set('error');
          this.manualError.set(err?.error?.message ?? 'Failed to save labor entry.');
        },
      });
  }

  private resetManualForm(): void {
    this.manualServiceId.set('');
    this.manualDescription.set('');
    this.manualHours.set(0);
    this.manualLaborCode.set('');
    this.manualFlatRate.set(false);
  }

  back(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId()]);
  }
}
