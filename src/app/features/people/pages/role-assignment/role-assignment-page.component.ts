import { Component, computed, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PeopleAccessControlService, PersonRoleAssignmentRequest, RoleDto, UserRoleDto } from '@durion-sdk/people';

@Component({
  selector: 'app-role-assignment-page',
  standalone: true,
  imports: [TranslatePipe],
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
        this.errorMessage.set('PEOPLE.ROLE_ASSIGNMENT.ERROR.LOAD_ASSIGNMENTS');
        this.loading.set(false);
      },
    });
  }

  loadRoles(): void {
    this.errorMessage.set(null);
    this.accessControlService.getRoles(this.personUuid()).subscribe({
      next: data => this.roles.set(data),
      error: () => {
        this.errorMessage.set('PEOPLE.ROLE_ASSIGNMENT.ERROR.LOAD_ROLES');
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
        this.errorMessage.set('PEOPLE.ROLE_ASSIGNMENT.ERROR.ASSIGN');
      },
    });
  }

  getAssignmentKey(assignment: UserRoleDto): string {
    return [
      assignment.roleCode ?? '',
      assignment.locationId ?? '',
      assignment.startDate ?? '',
      assignment.endDate ?? '',
      assignment.userId ?? '',
    ].join('|');
  }

  startRevoke(assignment: UserRoleDto): void {
    this.confirmingAssignmentId.set(this.getAssignmentKey(assignment));
  }

  revokeAssignment(assignment: UserRoleDto): void {
    const roleCode = assignment.roleCode;
    if (!roleCode) {
      return;
    }

    this.errorMessage.set(null);
    this.accessControlService.revokeAssignment(this.personUuid(), roleCode).subscribe({
      next: () => {
        this.confirmingAssignmentId.set(null);
        this.loadAssignments();
      },
      error: () => {
        this.errorMessage.set('PEOPLE.ROLE_ASSIGNMENT.ERROR.REVOKE');
        this.confirmingAssignmentId.set(null);
      },
    });
  }
}
