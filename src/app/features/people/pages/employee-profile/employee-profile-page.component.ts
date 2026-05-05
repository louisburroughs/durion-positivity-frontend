import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeProfileDto, CreateEmployeeRequestStatusEnum, UpdateEmployeeRequestStatusEnum, EmployeeProfileDtoStatusEnum } from '@durion-sdk/people';
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

  readonly employmentStatusValues = Object.values(CreateEmployeeRequestStatusEnum);

  private employeeId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly employee = signal<EmployeeProfileDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly conflictError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly saveSuccess = signal(false);

  readonly form = new FormGroup({
    legalName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    employeeNumber: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl<CreateEmployeeRequestStatusEnum | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    hireDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
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
            legalName: emp.legalName ?? '',
            employeeNumber: emp.employeeNumber ?? '',
            status: this.toCreateStatus(emp.status),
            hireDate: emp.hireDate ?? '',
            email: emp.contactInfo?.primaryEmail ?? '',
            phone: emp.contactInfo?.primaryPhone ?? '',
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

    const { legalName, employeeNumber, status, hireDate, email, phone } = this.form.getRawValue();
    const contactInfo = (email || phone) ? {
      primaryEmail: email || undefined,
      primaryPhone: phone || undefined,
    } : undefined;

    if (this.isEditMode) {
      const employeeId = this.employeeId;
      if (!employeeId) {
        this.saving.set(false);
        this.error.set('Failed to save employee.');
        return;
      }

      this.peopleService.updateEmployee(employeeId, {
        legalName,
        employeeNumber,
        status: (status || 'ACTIVE') as UpdateEmployeeRequestStatusEnum,
        hireDate,
        contactInfo,
      })
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

    this.peopleService.createEmployee({
      legalName,
      employeeNumber,
      status: status as CreateEmployeeRequestStatusEnum,
      hireDate,
      contactInfo,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (employee) => {
          this.saving.set(false);
          this.router.navigate(['/app/people/employees', employee.id]);
        },
        error: (err) => {
          this.handleSaveError(err);
        },
      });
  }

  private toCreateStatus(status: EmployeeProfileDtoStatusEnum | undefined): CreateEmployeeRequestStatusEnum | '' {
    if (!status) {
      return '';
    }
    const statusStr = status as string;
    const validValues = Object.values(CreateEmployeeRequestStatusEnum) as string[];
    return validValues.includes(statusStr) ? (statusStr as CreateEmployeeRequestStatusEnum) : '';
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
