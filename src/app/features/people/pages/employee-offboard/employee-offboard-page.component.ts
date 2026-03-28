import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Employee } from '../../models/employee.models';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-employee-offboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-offboard-page.component.html',
  styleUrl: './employee-offboard-page.component.css',
})
export class EmployeeOffboardPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private employeeId = '';

  readonly loading = signal(false);
  readonly employee = signal<Employee | null>(null);
  readonly error = signal<string | null>(null);
  readonly showConfirmDialog = signal(false);
  readonly submitting = signal(false);
  readonly offboardSuccess = signal(false);

  readonly offboardDateControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id') ?? '';
    if (this.employeeId) {
      this.loadEmployee();
    }
  }

  loadEmployee(): void {
    this.loading.set(true);
    this.peopleService.getEmployee(this.employeeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (emp) => {
          this.employee.set(emp);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load employee.');
          this.loading.set(false);
        },
      });
  }

  openConfirmDialog(): void {
    this.error.set(null);
    this.showConfirmDialog.set(true);
  }

  cancelConfirmDialog(): void {
    this.showConfirmDialog.set(false);
  }

  confirmOffboard(): void {
    const offboardDate = this.offboardDateControl.value;
    if (!offboardDate) {
      return;
    }

    this.submitting.set(true);
    this.peopleService.disableEmployee(this.employeeId, { offboardDate })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showConfirmDialog.set(false);
          this.offboardSuccess.set(true);
          this.submitting.set(false);
          const id = setTimeout(() => this.router.navigate(['/app/people']), 1500);
          this.destroyRef.onDestroy(() => clearTimeout(id));
        },
        error: () => {
          this.showConfirmDialog.set(false);
          this.error.set('Failed to disable employee. Please try again.');
          this.submitting.set(false);
        },
      });
  }
}
