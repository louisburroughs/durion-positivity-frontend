import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Employee, EmploymentStatus, UpdateEmployeeRequest } from '../../models/employee.models';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-employee-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-profile-page.component.html',
  styleUrl: './employee-profile-page.component.css',
})
export class EmployeeProfilePageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly employmentStatusValues = Object.values(EmploymentStatus);

  private employeeId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly employee = signal<Employee | null>(null);
  readonly error = signal<string | null>(null);
  readonly conflictError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly saveSuccess = signal(false);

  readonly form = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    employmentStatus: new FormControl<EmploymentStatus | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    hireDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
    department: new FormControl('', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true }),
  });

  get isEditMode(): boolean {
    return this.employeeId !== null;
  }

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    if (this.isEditMode) {
      this.loadEmployee();
    }
  }

  loadEmployee(): void {
    if (!this.employeeId) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.peopleService.getEmployee(this.employeeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (emp) => {
          this.employee.set(emp);
          this.form.patchValue({
            firstName: emp.firstName,
            lastName: emp.lastName,
            employmentStatus: emp.employmentStatus,
            hireDate: emp.hireDate,
            email: emp.email ?? '',
            phone: emp.phone ?? '',
            department: emp.department ?? '',
            title: emp.title ?? '',
          });
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load employee.');
          this.loading.set(false);
        },
      });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.error.set(null);
    this.saveSuccess.set(false);
    this.conflictError.set(null);
    this.fieldErrors.set({});
    this.saving.set(true);

    const body = this.form.getRawValue();

    if (this.isEditMode) {
      const employeeId = this.employeeId;
      if (!employeeId) {
        this.saving.set(false);
        this.error.set('Failed to save employee.');
        return;
      }

      this.peopleService.updateEmployee(employeeId, body as UpdateEmployeeRequest)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (emp) => {
            this.employee.set(emp);
            this.saveSuccess.set(true);
            this.saving.set(false);
          },
          error: (err) => {
            this.handleSaveError(err);
          },
        });
      return;
    }

    this.peopleService.createEmployee(body as Record<string, unknown>)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employee) => {
          this.saving.set(false);
          this.router.navigate(['/app/people/employees', employee.employeeId]);
        },
        error: (err) => {
          this.handleSaveError(err);
        },
      });
  }

  private handleSaveError(err: {
    status?: number;
    error?: {
      errors?: Array<{ field?: string; message?: string }>;
      fieldErrors?: Record<string, string>;
      message?: string;
    };
  }): void {
    this.saving.set(false);
    if (err.status === 409) {
      this.conflictError.set(err.error?.message ?? 'A duplicate employee record was found.');
      return;
    }

    if (err.status === 400) {
      if (err.error?.fieldErrors) {
        this.fieldErrors.set(err.error.fieldErrors);
        return;
      }

      const mappedErrors: Record<string, string> = {};
      for (const fieldError of err.error?.errors ?? []) {
        if (fieldError.field && fieldError.message) {
          mappedErrors[fieldError.field] = fieldError.message;
        }
      }

      if (Object.keys(mappedErrors).length > 0) {
        this.fieldErrors.set(mappedErrors);
        return;
      }
    }

    this.error.set('Failed to save employee.');
  }
}
