import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LocationService } from '../../../location/services/location.service';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-person-location-assignments-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './person-location-assignments-page.component.html',
  styleUrl: './person-location-assignments-page.component.css',
})
export class PersonLocationAssignmentsPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly locationService = inject(LocationService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly personId = signal('');
  readonly loading = signal(false);
  readonly assignments = signal<unknown[]>([]);
  readonly availableLocations = signal<unknown[]>([]);
  readonly error = signal<string | null>(null);
  readonly showCreateDialog = signal(false);
  readonly showEndDialog = signal(false);
  readonly submitting = signal(false);
  readonly selectedAssignmentId = signal<string | null>(null);
  readonly conflictError = signal<string | null>(null);

  readonly createForm = new FormGroup({
    locationId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    effectiveStartAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    effectiveEndAt: new FormControl('', { nonNullable: true }),
    primary: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    const personId = this.route.snapshot.paramMap.get('personId') ?? '';
    this.personId.set(personId);
    if (personId) {
      this.loadAssignments();
      this.loadLocations();
    }
  }

  loadAssignments(): void {
    this.loading.set(true);
    this.error.set(null);
    this.peopleService.getPersonLocationAssignments(this.personId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.assignments.set(Array.isArray(data) ? data : []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load location assignments.');
          this.loading.set(false);
        },
      });
  }

  loadLocations(): void {
    this.locationService.getAllLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.availableLocations.set(Array.isArray(data) ? data : []),
        error: () => {
          // non-fatal
        },
      });
  }

  openCreateDialog(): void {
    this.createForm.reset({ locationId: '', effectiveStartAt: '', effectiveEndAt: '', primary: false });
    this.conflictError.set(null);
    this.showCreateDialog.set(true);
  }

  closeCreateDialog(): void {
    this.showCreateDialog.set(false);
  }

  submitCreate(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) {
      return;
    }
    this.submitting.set(true);
    this.conflictError.set(null);
    const { locationId, effectiveStartAt, effectiveEndAt, primary } = this.createForm.getRawValue();
    const body: Record<string, unknown> = { locationId, effectiveStartAt, primary };
    if (effectiveEndAt) {
      body['effectiveEndAt'] = effectiveEndAt;
    }
    this.peopleService.createPersonLocationAssignment(this.personId(), body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.showCreateDialog.set(false);
          this.loadAssignments();
        },
        error: (err) => {
          this.submitting.set(false);
          if (err?.status === 409) {
            this.conflictError.set(err?.error?.message ?? 'An overlapping assignment exists.');
          } else {
            this.error.set('Failed to create assignment.');
          }
        },
      });
  }

  openEndDialog(assignmentId: string): void {
    this.selectedAssignmentId.set(assignmentId);
    this.showEndDialog.set(true);
  }

  closeEndDialog(): void {
    this.showEndDialog.set(false);
    this.selectedAssignmentId.set(null);
  }

  confirmEnd(): void {
    const assignmentId = this.selectedAssignmentId();
    if (!assignmentId) {
      return;
    }
    this.submitting.set(true);
    this.peopleService.endPersonLocationAssignment(assignmentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.showEndDialog.set(false);
          this.selectedAssignmentId.set(null);
          this.loadAssignments();
        },
        error: () => {
          this.submitting.set(false);
          this.error.set('Failed to end assignment.');
          this.showEndDialog.set(false);
        },
      });
  }

  getAssignmentId(a: unknown): string {
    return String((a as Record<string, unknown>)['assignmentId'] ?? '');
  }

  getLocationName(a: unknown, locations: unknown[]): string {
    const locationId = String((a as Record<string, unknown>)['locationId'] ?? '');
    const loc = locations.find(l => String((l as Record<string, unknown>)['locationId']) === locationId);
    return loc ? String((loc as Record<string, unknown>)['name'] ?? locationId) : locationId;
  }

  getEffectiveStart(a: unknown): string {
    return String((a as Record<string, unknown>)['effectiveStartAt'] ?? '');
  }

  getEffectiveEnd(a: unknown): string {
    return String((a as Record<string, unknown>)['effectiveEndAt'] ?? '-');
  }
}
