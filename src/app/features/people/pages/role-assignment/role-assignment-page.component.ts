import { Component, computed, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PersonRoleAssignmentRequest, RoleDto, UserRoleDto } from '@durion-sdk/people-contact';
import { AuthService } from '../../../../core/services/auth.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-role-assignment-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './role-assignment-page.component.html',
  styleUrl: './role-assignment-page.component.css',
})
export class RoleAssignmentPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  personUuid = signal('');
  personLabel = signal('');
  assignments = signal<UserRoleDto[]>([]);
  roles = signal<RoleDto[]>([]);
  loading = signal(false);
  selectedRoleCode = signal('');
  effectiveStartAt = signal('');
  effectiveEndAt = signal('');
  includeHistory = signal(false);
  errorMessage = signal<string | null>(null);
  confirmingAssignmentId = signal<string | null>(null);

  canSubmit = computed(() => !!this.effectiveStartAt() && !!this.selectedRoleCode());

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(params => {
      this.personUuid.set(params['personUuid'] ?? '');
      this.personLabel.set('');
      if (this.personUuid()) {
        this.loadPersonLabel();
        this.loadAssignments();
        this.loadRoles();
      }
    });
  }

  /**
   * Resolves the route's person id to a display name so the header says whose
   * assignments these are. On failure the label stays empty and the header
   * simply omits it — the raw UUID is never shown as a fallback (UI rule).
   * Guarded against out-of-order responses on rapid navigation.
   */
  private loadPersonLabel(): void {
    // The page gate does not imply the identity read, so skip the lookup rather
    // than fire a request that can only 403. The header just omits the name.
    if (this.auth.permissionsKnown() && !this.auth.hasAnyPermission(PEOPLE_SECTION.personLookup)) {
      return;
    }
    const personUuid = this.personUuid();
    this.peopleService.getPerson(personUuid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: person => {
          if (this.personUuid() !== personUuid) {
            return; // route changed while this request was in flight
          }
          const name = [person.firstName, person.lastName]
            .filter(part => typeof part === 'string' && part.trim().length > 0)
            .join(' ');
          this.personLabel.set(name || person.username?.trim() || '');
        },
        error: () => {
          if (this.personUuid() === personUuid) {
            this.personLabel.set('');
          }
        },
      });
  }

  loadAssignments(): void {
    this.errorMessage.set(null);
    this.loading.set(true);
    this.peopleService.getRoleAssignments(this.personUuid(), this.includeHistory()).subscribe({
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
    this.peopleService.getAvailableRoles(this.personUuid()).subscribe({
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

    if (this.effectiveEndAt()) {
      body.endDate = this.effectiveEndAt();
    }

    this.peopleService.createRoleAssignment(this.personUuid(), body).subscribe({
      next: () => this.loadAssignments(),
      error: () => {
        this.errorMessage.set('PEOPLE.ROLE_ASSIGNMENT.ERROR.ASSIGN');
      },
    });
  }

  getAssignmentKey(assignment: UserRoleDto): string {
    return [
      assignment.roleCode ?? '',
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
    this.peopleService.revokeRoleAssignment(this.personUuid(), roleCode).subscribe({
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
