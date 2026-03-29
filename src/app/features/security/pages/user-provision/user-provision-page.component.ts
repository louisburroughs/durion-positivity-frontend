import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SecurityRole } from '../../models/security.models';
import { SecurityService } from '../../services/security.service';

@Component({
  selector: 'app-user-provision-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './user-provision-page.component.html',
  styleUrl: './user-provision-page.component.css',
})
export class UserProvisionPageComponent implements OnInit {
  private readonly securityService = inject(SecurityService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly personId = signal('');
  readonly roles = signal<SecurityRole[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly provisionedUserId = signal<string | null>(null);

  readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    roleName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    const pid = this.route.snapshot.queryParamMap.get('personId') ?? '';
    this.personId.set(pid);
    this.loadRoles();
  }

  loadRoles(): void {
    this.loading.set(true);
    this.securityService.getAllRoles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.roles.set(Array.isArray(res) ? res : (res?.results ?? []));
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load roles.');
          this.loading.set(false);
        },
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    this.fieldErrors.set({});

    const { username, roleName } = this.form.getRawValue();
    const personId = this.personId();
    const body: Record<string, unknown> = { username, roleId: roleName };
    if (personId) {
      body['personId'] = personId;
    }

    this.securityService.createUser(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const userId = (res as { userId?: string })?.userId ?? '';
          this.provisionedUserId.set(userId);
          this.submitting.set(false);
        },
        error: (err) => {
          this.submitting.set(false);
          if (err?.error?.fieldErrors) {
            this.fieldErrors.set(err.error.fieldErrors);
          } else {
            this.error.set('Failed to provision user.');
          }
        },
      });
  }
}
