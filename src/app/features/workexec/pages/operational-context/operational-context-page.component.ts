import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-operational-context-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './operational-context-page.component.html',
  styleUrl: './operational-context-page.component.css',
})
export class OperationalContextPageComponent implements OnInit {
  private readonly workexecService = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly workorderId = signal('');
  readonly context = signal<Record<string, unknown> | null>(null);
  readonly showOverrideForm = signal(false);
  readonly overrideLoading = signal(false);
  readonly overrideSuccess = signal(false);
  readonly overrideError = signal<string | null>(null);

  readonly overrideForm = new FormGroup({
    contextKey: new FormControl('', { nonNullable: true }),
    contextValue: new FormControl('', { nonNullable: true }),
    overrideReason: new FormControl('', { validators: [Validators.required], nonNullable: true }),
  });

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = String(params['id'] ?? '');
      if (!id) {
        return;
      }
      this.workorderId.set(id);
      this.loadContext();
    });
  }

  loadContext(): void {
    const id = this.workorderId();
    if (!id) {
      return;
    }

    this.loading.set(true);
    this.workexecService.getWorkorder(id).subscribe({
      next: (workorder) => {
        this.context.set(workorder as unknown as Record<string, unknown>);
        this.loading.set(false);
      },
      error: () => {
        this.overrideError.set('Failed to load operational context.');
        this.loading.set(false);
      },
    });
  }

  openOverrideForm(): void {
    this.showOverrideForm.set(true);
  }

  closeOverrideForm(): void {
    this.showOverrideForm.set(false);
  }

  submitOverride(): void {
    if (this.overrideForm.invalid) {
      this.overrideForm.markAllAsTouched();
      return;
    }

    this.overrideLoading.set(true);
    this.overrideSuccess.set(false);
    this.overrideError.set(null);

    this.workexecService.overrideOperationalContext(this.workorderId(), this.overrideForm.getRawValue()).subscribe({
      next: (response) => {
        this.context.set(response as unknown as Record<string, unknown>);
        this.overrideLoading.set(false);
        this.overrideSuccess.set(true);
        this.closeOverrideForm();
      },
      error: () => {
        this.overrideLoading.set(false);
        this.overrideError.set('Failed to override operational context.');
      },
    });
  }

  contextEntries(): Array<{ key: string; value: string }> {
    const value = this.context();
    if (!value || typeof value !== 'object') {
      return [];
    }
    return Object.entries(value).map(([key, rawValue]) => ({
      key,
      value: String(rawValue),
    }));
  }
}
