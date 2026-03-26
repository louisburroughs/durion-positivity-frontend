import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CrmService } from '../../services/crm.service';

type PageState = 'idle' | 'submitting' | 'success' | 'error' | 'access-denied';

@Component({
  selector: 'app-create-vehicle',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-vehicle.component.html',
  styleUrl: './create-vehicle.component.css',
})
export class CreateVehicleComponent implements OnInit {
  private readonly fb     = inject(FormBuilder);
  private readonly crm    = inject(CrmService);
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state            = signal<PageState>('idle');
  readonly createdVehicleId = signal<string | null>(null);
  readonly serverError      = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    vin:        ['', Validators.required],
    year:       [''],
    make:       [''],
    model:      [''],
    unitNumber: [''],
  });

  get partyId(): string {
    return this.route.snapshot.paramMap.get('partyId') ?? '';
  }

  ngOnInit(): void {
    if (!this.partyId) this.router.navigate(['/app/crm']);
  }

  submit(): void {
    if (this.form.invalid || this.state() === 'submitting') return;
    this.serverError.set(null);
    this.state.set('submitting');

    const raw = this.form.getRawValue();
    this.crm.createVehicleForParty(this.partyId, {
      vin:        raw.vin,
      year:       raw.year ? parseInt(raw.year, 10) : undefined,
      make:       raw.make || undefined,
      model:      raw.model || undefined,
      unitNumber: raw.unitNumber || undefined,
    }).subscribe({
      next: res => {
        this.createdVehicleId.set(res.vehicleId);
        this.state.set('success');
      },
      error: err => {
        if (err?.status === 403) {
          this.state.set('access-denied');
        } else {
          this.serverError.set(
            err?.error?.message ?? `Vehicle creation failed (${err?.status ?? 'error'}).`,
          );
          this.state.set('error');
        }
      },
    });
  }

  addAnother(): void {
    this.form.reset();
    this.createdVehicleId.set(null);
    this.serverError.set(null);
    this.state.set('idle');
  }

  backToParty(): void {
    this.router.navigate(['/app/crm/party', this.partyId]);
  }

  get vinCtrl()        { return this.form.controls.vin; }
  get isIdle()         { return this.state() === 'idle'; }
  get isSubmitting()   { return this.state() === 'submitting'; }
  get isSuccess()      { return this.state() === 'success'; }
  get isError()        { return this.state() === 'error'; }
  get isAccessDenied() { return this.state() === 'access-denied'; }
}
