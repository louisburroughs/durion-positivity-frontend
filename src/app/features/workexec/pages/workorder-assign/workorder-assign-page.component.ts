import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  AssignTechnicianRequest,
  TechnicianAssignmentResponse,
  WorkorderResponse,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';
type FormMode = 'assign' | 'reassign';

/**
 * WorkorderAssignPageComponent — Story 225 (CAP-005)
 * Route: /app/workexec/workorders/:workorderId/assign
 * operationIds: assignTechnician, reassignTechnician, getTechnicianAssignment, getWorkorderById
 */
@Component({
  selector: 'app-workorder-assign-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workorder-assign-page.component.html',
  styleUrl: './workorder-assign-page.component.css',
})
export class WorkorderAssignPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workorderId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly workorder = signal<WorkorderResponse | null>(null);
  readonly currentAssignment = signal<TechnicianAssignmentResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly saveState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly saveError = signal<string | null>(null);

  readonly technicianId = signal<string>('');
  readonly notes = signal<string>('');

  readonly formMode = signal<FormMode>('assign');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('workorderId') ?? '';
    this.workorderId.set(id);
    this.loadData(id);
  }

  private loadData(id: string): void {
    this.pageState.set('loading');
    this.service
      .getWorkorderById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (wo) => {
          this.workorder.set(wo);
          if (wo.primaryTechnicianId) {
            this.formMode.set('reassign');
            this.loadCurrentAssignment(id);
          } else {
            this.pageState.set('ready');
          }
        },
        error: () => {
          this.errorMessage.set('Failed to load work order.');
          this.pageState.set('error');
        },
      });
  }

  private loadCurrentAssignment(id: string): void {
    this.service
      .getTechnicianAssignment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => {
          this.currentAssignment.set(a);
          this.pageState.set('ready');
        },
        error: () => this.pageState.set('ready'),
      });
  }

  save(): void {
    const id = this.workorderId();
    const techId = this.technicianId().trim();
    if (!techId) {
      this.saveError.set('Technician ID is required.');
      return;
    }
    const request: AssignTechnicianRequest = { technicianId: techId, notes: this.notes().trim() || undefined };
    this.saveState.set('loading');
    this.saveError.set(null);

    const call$ =
      this.formMode() === 'reassign'
        ? this.service.reassignTechnician(id, request, uuidv4())
        : this.service.assignTechnician(id, request, uuidv4());

    call$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saveState.set('success');
        this.router.navigate(['/app/workexec/workorders', id]);
      },
      error: (err) => {
        this.saveState.set('error');
        this.saveError.set(
          err?.error?.message ?? 'Failed to save technician assignment. Please try again.',
        );
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId()]);
  }
}
