import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PeopleService } from '../../../people/services/people.service';

@Component({
  selector: 'app-mechanic-roster-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './mechanic-roster-page.component.html',
  styleUrl: './mechanic-roster-page.component.css',
})
export class MechanicRosterPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);

  readonly loading = signal(false);
  readonly people = signal<unknown[]>([]);
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly createLoading = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createSuccess = signal(false);

  readonly createForm = new FormGroup({
    firstName: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    lastName: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    email: new FormControl('', { validators: [Validators.required, Validators.email], nonNullable: true }),
    role: new FormControl('MECHANIC', { validators: [Validators.required], nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadPeople();
  }

  loadPeople(): void {
    this.loading.set(true);
    this.error.set(null);

    this.peopleService.getAllPeople().subscribe({
      next: (people) => {
        this.people.set(Array.isArray(people) ? people : []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load people.');
        this.people.set([]);
        this.loading.set(false);
      },
    });
  }

  openCreateModal(): void {
    this.createError.set(null);
    this.createSuccess.set(false);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  submitCreateEmployee(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.createLoading.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);

    this.peopleService.createEmployee(this.createForm.getRawValue()).subscribe({
      next: () => {
        this.createLoading.set(false);
        this.createSuccess.set(true);
        this.closeCreateModal();
        this.loadPeople();
      },
      error: () => {
        this.createLoading.set(false);
        this.createError.set('Failed to create employee.');
      },
    });
  }

  getDisplayName(person: unknown): string {
    const data = person as Record<string, unknown>;
    const firstName = String(data['firstName'] ?? '');
    const lastName = String(data['lastName'] ?? '');
    const fallback = String(data['name'] ?? data['personId'] ?? 'Unknown');
    return `${firstName} ${lastName}`.trim() || fallback;
  }
}
