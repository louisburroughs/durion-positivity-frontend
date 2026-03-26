import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CrmService } from '../../services/crm.service';

type PageState = 'idle' | 'submitting' | 'success' | 'error' | 'access-denied';

@Component({
  selector: 'app-create-individual-person',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-individual-person.component.html',
  styleUrl: './create-individual-person.component.css',
})
export class CreateIndividualPersonComponent {
  private readonly fb     = inject(FormBuilder);
  private readonly crm    = inject(CrmService);
  private readonly router = inject(Router);

  readonly state          = signal<PageState>('idle');
  readonly createdPersonId = signal<string | null>(null);
  readonly serverError    = signal<string | null>(null);
  readonly copied         = signal(false);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName:  ['', Validators.required],
    email:     [''],
    phone:     [''],
  });

  submit(): void {
    if (this.form.invalid || this.state() === 'submitting') return;
    this.serverError.set(null);
    this.state.set('submitting');

    const raw = this.form.getRawValue();
    this.crm.createPerson({
      firstName: raw.firstName,
      lastName:  raw.lastName,
      email:     raw.email || undefined,
      phone:     raw.phone || undefined,
    }).subscribe({
      next: res => {
        this.createdPersonId.set(res.personId);
        this.state.set('success');
      },
      error: err => {
        if (err?.status === 403) {
          this.state.set('access-denied');
        } else {
          this.serverError.set(
            err?.error?.message ?? `Person creation failed (${err?.status ?? 'unknown'}). Please try again.`,
          );
          this.state.set('error');
        }
      },
    });
  }

  copyPersonId(): void {
    const id = this.createdPersonId();
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  createAnother(): void {
    this.form.reset();
    this.createdPersonId.set(null);
    this.serverError.set(null);
    this.state.set('idle');
  }

  viewPerson(): void {
    const id = this.createdPersonId();
    if (id) this.router.navigate(['/app/crm/person', id]);
  }

  get isIdle()         { return this.state() === 'idle'; }
  get isSubmitting()   { return this.state() === 'submitting'; }
  get isSuccess()      { return this.state() === 'success'; }
  get isError()        { return this.state() === 'error'; }
  get isAccessDenied() { return this.state() === 'access-denied'; }

  get firstNameCtrl() { return this.form.controls.firstName; }
  get lastNameCtrl()  { return this.form.controls.lastName; }
}
