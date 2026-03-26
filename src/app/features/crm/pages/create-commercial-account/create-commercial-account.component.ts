import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CrmService } from '../../services/crm.service';
import {
  BillingTermsRef,
  DuplicateCandidate,
} from '../../models/crm.models';

type PageState = 'idle' | 'loading-terms' | 'terms-error' | 'checking' | 'duplicates' | 'submitting' | 'success' | 'error' | 'access-denied';

@Component({
  selector: 'app-create-commercial-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-commercial-account.component.html',
  styleUrl: './create-commercial-account.component.css',
})
export class CreateCommercialAccountComponent implements OnInit {
  private readonly fb     = inject(FormBuilder);
  private readonly crm    = inject(CrmService);
  private readonly router = inject(Router);

  readonly state             = signal<PageState>('loading-terms');
  readonly billingTerms      = signal<BillingTermsRef[]>([]);
  readonly duplicates        = signal<DuplicateCandidate[]>([]);
  readonly createdPartyId    = signal<string | null>(null);
  readonly serverError       = signal<string | null>(null);
  readonly copied            = signal(false);

  readonly form = this.fb.nonNullable.group({
    legalName:             ['', Validators.required],
    dba:                   [''],
    taxId:                 [''],
    defaultBillingTermsId: ['', Validators.required],
  });

  readonly overrideForm = this.fb.nonNullable.group({
    justification: ['', Validators.required],
  });

  ngOnInit(): void {
    this.loadBillingTerms();
  }

  private loadBillingTerms(): void {
    this.state.set('loading-terms');
    this.crm.getBillingTerms().subscribe({
      next: terms => {
        this.billingTerms.set(terms);
        this.state.set('idle');
      },
      error: err => {
        if (err?.status === 403) {
          this.state.set('access-denied');
        } else {
          this.state.set('terms-error');
        }
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.state() === 'submitting' || this.state() === 'checking') return;
    this.serverError.set(null);
    this.state.set('checking');

    const { legalName } = this.form.getRawValue();
    this.crm.checkCommercialAccountDuplicates(legalName).subscribe({
      next: res => {
        if (res.duplicates?.length) {
          this.duplicates.set(res.duplicates);
          this.state.set('duplicates');
        } else {
          this.createAccount();
        }
      },
      error: () => this.createAccount(),
    });
  }

  proceedWithOverride(): void {
    if (this.overrideForm.invalid) return;
    this.createAccount(this.overrideForm.getRawValue().justification);
  }

  cancelOverride(): void {
    this.overrideForm.reset();
    this.state.set('idle');
    this.duplicates.set([]);
  }

  private createAccount(overrideJustification?: string): void {
    this.state.set('submitting');
    const raw = this.form.getRawValue();

    this.crm.createCommercialAccount({
      legalName:                   raw.legalName,
      dba:                         raw.dba || undefined,
      taxId:                       raw.taxId || undefined,
      defaultBillingTermsId:       raw.defaultBillingTermsId,
      overrideDuplicate:           !!overrideJustification,
      overrideDuplicateJustification: overrideJustification,
    }).subscribe({
      next: res => {
        this.createdPartyId.set(res.partyId);
        this.state.set('success');
      },
      error: err => {
        if (err?.status === 403) {
          this.state.set('access-denied');
        } else {
          this.serverError.set(
            err?.error?.message ?? `Account creation failed (${err?.status ?? 'unknown'}). Please try again.`,
          );
          this.state.set('error');
        }
      },
    });
  }

  copyPartyId(): void {
    const id = this.createdPartyId();
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  createAnother(): void {
    this.form.reset();
    this.overrideForm.reset();
    this.createdPartyId.set(null);
    this.serverError.set(null);
    this.duplicates.set([]);
    this.state.set('idle');
  }

  viewParty(): void {
    const id = this.createdPartyId();
    if (id) this.router.navigate(['/app/crm/party', id]);
  }

  retryTermsLoad(): void {
    this.loadBillingTerms();
  }

  // Convenience for template
  get isIdle()         { return this.state() === 'idle'; }
  get isLoadingTerms() { return this.state() === 'loading-terms'; }
  get isTermsError()   { return this.state() === 'terms-error'; }
  get isChecking()     { return this.state() === 'checking'; }
  get isDuplicates()   { return this.state() === 'duplicates'; }
  get isSubmitting()   { return this.state() === 'submitting'; }
  get isSuccess()      { return this.state() === 'success'; }
  get isError()        { return this.state() === 'error'; }
  get isAccessDenied() { return this.state() === 'access-denied'; }
  get isBusy()         { return this.isChecking || this.isSubmitting || this.isLoadingTerms; }

  get legalNameCtrl()     { return this.form.controls.legalName; }
  get billingTermsCtrl()  { return this.form.controls.defaultBillingTermsId; }
  get justificationCtrl() { return this.overrideForm.controls.justification; }
}
