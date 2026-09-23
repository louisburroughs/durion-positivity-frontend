import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CrmService } from '../../services/crm.service';

type PageState = 'idle' | 'submitting' | 'success' | 'error' | 'access-denied';

@Component({
  selector: 'app-create-vehicle',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create-vehicle.component.html',
  styleUrl: './create-vehicle.component.css',
})
export class CreateVehicleComponent implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly fb     = inject(FormBuilder);
  private readonly crm    = inject(CrmService);
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state            = signal<PageState>('idle');
  readonly createdVehicleId = signal<string | null>(null);
  /** Echoed on success instead of the registry id (issue #285). */
  readonly createdVin       = signal<string | null>(null);
  readonly serverError      = signal<string | null>(null);
  /**
   * Display name for the subtitle (issue #285: never the route UUID). An enrichment
   * read: when it fails the subtitle names "this party" instead, true either way.
   */
  readonly partyName        = signal<string | null>(null);

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
    if (!this.partyId) {
      this.router.navigate(['/app/crm']);
      return;
    }
    this.crm.getParty(this.partyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: party => this.partyName.set(party.dba?.trim() || party.legalName?.trim() || null),
        error: () => this.partyName.set(null),
      });
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
        this.createdVin.set(raw.vin);
        this.state.set('success');
      },
      error: err => {
        if (err?.status === 403) {
          this.state.set('access-denied');
        } else {
          this.serverError.set(
            err?.error?.message ?? this.translate.instant('CRM.CREATE_VEHICLE.ERROR.CREATE_FAILED', { status: err?.status ?? 'error' }),
          );
          this.state.set('error');
        }
      },
    });
  }

  addAnother(): void {
    this.form.reset();
    this.createdVehicleId.set(null);
    this.createdVin.set(null);
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
