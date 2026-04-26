import { Component, computed, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { PeopleAccessControlService, PersonRoleAssignmentRequest, RoleDto, UserRoleDto } from '@durion-sdk/people';

@Component({
  selector: 'app-role-assignment-page',
  standalone: true,
  imports: [],
  templateUrl: './role-assignment-page.component.html',
  styleUrl: './role-assignment-page.component.css',
})
export class RoleAssignmentPageComponent implements OnInit {
  private readonly accessControlService = inject(PeopleAccessControlService);
  private readonly destroyRef = inject(DestroyRef);

  personUuid = signal('');
  assignments = signal<UserRoleDto[]>([]);
  roles = signal<RoleDto[]>([]);
  loading = signal(false);
  scopeType = signal<'GLOBAL' | 'LOCATION'>('GLOBAL');
  locationId = signal('');
  selectedRoleCode = signal('');
  effectiveStartAt = signal('');
  effectiveEndAt = signal('');
  includeHistory = signal(false);
  errorMessage = signal<string | null>(null);
  confirmingAssignmentId = signal<string | null>(null);

  canSubmit = computed(() =>
    !!this.effectiveStartAt() &&
    !!this.selectedRoleCode() &&
    (this.scopeType() === 'GLOBAL' || !!this.locationId()),
  );

  constructor(
    private readonly route: ActivatedRoute,
  ) { }

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(params => {
      this.personUuid.set(params['personUuid'] ?? '');
      if (this.personUuid()) {
        this.loadAssignments();
        this.loadRoles();
      }
    });
  }

  loadAssignments(): void {
    this.errorMessage.set(null);
    this.loading.set(true);
    this.accessControlService.getAssignments(this.personUuid(), this.includeHistory()).subscribe({
      next: data => {
        this.assignments.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load role assignments. Please try again.');
        this.loading.set(false);
      },
    });
  }

  loadRoles(): void {
    this.errorMessage.set(null);
    this.accessControlService.getRoles(this.personUuid()).subscribe({
      next: data => this.roles.set(data),
      error: () => {
        this.errorMessage.set('Unable to load available roles. Please try again.');
      },
    });
  }

  submitAssignment(): void {
    this.errorMessage.set(null);
    if (!this.canSubmit()) {
      return;
    }

    const body: PersonRoleAssignmentRequest = {
      roleCode: this.selectedRoleCode(),
      startDate: this.effectiveStartAt() || undefined,
    };

    if (this.scopeType() === 'LOCATION' && this.locationId()) {
      body.locationId = this.locationId();
    }

    if (this.effectiveEndAt()) {
      body.endDate = this.effectiveEndAt();
    }

    this.accessControlService.createAssignment(this.personUuid(), body).subscribe({
      next: () => this.loadAssignments(),
      error: () => {
        this.errorMessage.set('Unable to assign the selected role. Please try again.');
      },
    });
  }

  startRevoke(assignmentId: string): void {
    this.confirmingAssignmentId.set(assignmentId);
  }

  revokeAssignment(roleCode: string): void {
    this.errorMessage.set(null);
    this.accessControlService.revokeAssignment(this.personUuid(), roleCode).subscribe({
      next: () => {
        this.confirmingAssignmentId.set(null);
        this.loadAssignments();
      },
      error: () => {
        this.errorMessage.set('Unable to revoke the role assignment. Please try again.');
        this.confirmingAssignmentId.set(null);
      },
    });
  }
}
