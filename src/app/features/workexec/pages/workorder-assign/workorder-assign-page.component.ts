import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  AssignTechnicianRequest,
  LocationTechnician,
  TechnicianAssignmentResponse,
  WorkorderResponse,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';
type FormMode = 'assign' | 'reassign';
type RosterState = 'idle' | 'loading' | 'ready' | 'error' | 'no-shop';

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

  // ── Technician typeahead ──────────────────────────────────────────────────
  /** Full technician roster for the workorder's location. */
  readonly technicians = signal<LocationTechnician[]>([]);
  readonly rosterState = signal<RosterState>('idle');
  /** Free text typed into the typeahead; filters the roster client-side. */
  readonly techQuery = signal<string>('');
  readonly showTechList = signal<boolean>(false);
  readonly activeIndex = signal<number>(-1);

  /** Roster filtered by the typeahead term; shows all when the term is empty. */
  readonly filteredTechnicians = computed(() => {
    const q = this.techQuery().trim().toLowerCase();
    const all = this.technicians();
    if (!q) {
      return all;
    }
    return all.filter(t => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  });

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
          this.loadTechnicians(wo.shopId);
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

  private loadTechnicians(locationId: string | undefined): void {
    if (!locationId) {
      // The work order has no shop, so there is no location to source a roster from.
      // Distinct from 'error' (a failed availability call) so the UI can explain why.
      this.rosterState.set('no-shop');
      return;
    }
    this.rosterState.set('loading');
    this.service
      .listTechniciansForLocation(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (techs) => {
          this.technicians.set(techs);
          this.rosterState.set('ready');
        },
        error: () => {
          this.technicians.set([]);
          this.rosterState.set('error');
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

  // ── Technician typeahead interaction ──────────────────────────────────────
  onTechInput(text: string): void {
    this.techQuery.set(text);
    // Typing invalidates a prior selection until a row is chosen again.
    this.technicianId.set('');
    this.showTechList.set(true);
    this.activeIndex.set(-1);
  }

  onTechFocus(): void {
    this.showTechList.set(true);
  }

  onTechBlur(): void {
    // Delay so a row mousedown registers before the list closes.
    setTimeout(() => this.showTechList.set(false), 150);
  }

  onTechKeydown(event: KeyboardEvent): void {
    const items = this.filteredTechnicians();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.showTechList.set(true);
      this.activeIndex.set(Math.min(this.activeIndex() + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.activeIndex();
      if (idx >= 0 && idx < items.length) {
        event.preventDefault();
        this.selectTechnician(items[idx]);
      }
    } else if (event.key === 'Escape') {
      this.showTechList.set(false);
      this.activeIndex.set(-1);
    }
  }

  selectTechnician(tech: LocationTechnician): void {
    this.technicianId.set(tech.id);
    this.techQuery.set(tech.name);
    this.showTechList.set(false);
    this.activeIndex.set(-1);
    this.saveError.set(null);
  }

  save(): void {
    const id = this.workorderId();
    const techId = this.technicianId().trim();
    if (!techId) {
      this.saveError.set('Select a technician from the list.');
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
