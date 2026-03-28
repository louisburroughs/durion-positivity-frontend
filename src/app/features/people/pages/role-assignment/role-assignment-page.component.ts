import { Component, computed, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CreateAssignmentRequest, Role, RoleAssignment } from '../../models/people-rbac.models';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-role-assignment-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './role-assignment-page.component.html',
  styleUrl: './role-assignment-page.component.css',
})
export class RoleAssignmentPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  personUuid = signal('');
  assignments = signal<RoleAssignment[]>([]);
  roles = signal<Role[]>([]);
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
    private readonly peopleService: PeopleService,
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
    this.peopleService.getAssignments(this.personUuid(), this.includeHistory()).subscribe({
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
    this.peopleService.getRoles(this.personUuid()).subscribe({
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

    const body: CreateAssignmentRequest = {
      personId: this.personUuid(),
      roleCode: this.selectedRoleCode(),
      scopeType: this.scopeType(),
      effectiveStartAt: this.effectiveStartAt(),
    };

    if (this.scopeType() === 'LOCATION' && this.locationId()) {
      body.locationId = this.locationId();
    }

    if (this.effectiveEndAt()) {
      body.effectiveEndAt = this.effectiveEndAt();
    }

    this.peopleService.createAssignment(body).subscribe({
      next: () => this.loadAssignments(),
      error: () => {
        this.errorMessage.set('Unable to assign the selected role. Please try again.');
      },
    });
  }

  startRevoke(assignmentId: string): void {
    this.confirmingAssignmentId.set(assignmentId);
  }

  revokeAssignment(roleCode: string, assignmentId?: string): void {
    this.errorMessage.set(null);
    this.peopleService.revokeAssignment(this.personUuid(), roleCode).subscribe({
      next: () => {
        this.confirmingAssignmentId.set(null);
        this.loadAssignments();
      },
      error: () => {
        this.errorMessage.set('Unable to revoke the role assignment. Please try again.');
        if (assignmentId && this.confirmingAssignmentId() === assignmentId) {
          this.confirmingAssignmentId.set(null);
        }
      },
    });
  }
}
