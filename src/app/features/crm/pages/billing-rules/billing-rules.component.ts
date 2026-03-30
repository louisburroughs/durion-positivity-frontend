import {
  Component,
  DestroyRef,
  computed,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CrmService } from '../../services/crm.service';
import {
  BillingRules,
} from '../../models/crm.models';

@Component({
  selector: 'app-billing-rules',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './billing-rules.component.html',
  styleUrl: './billing-rules.component.css',
})
export class BillingRulesPageComponent implements OnInit {
  private readonly crm = inject(CrmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly pageState = computed<'loading' | 'ready' | 'error' | 'access-denied'>(() => {
    if (this.state() === 'loading' || this.state() === 'idle') {
      return 'loading';
    }
    if (this.state() === 'ready' || this.state() === 'empty') {
      return 'ready';
    }
    return this.errorKey() === 'CRM.BILLING_RULES.ERROR.FORBIDDEN' ? 'access-denied' : 'error';
  });

  readonly billingRules = signal<BillingRules | null>(null);
  readonly isSaving = signal<boolean>(false);

  get partyId(): string {
    return this.route.snapshot.paramMap.get('partyId') ?? '';
  }

  ngOnInit(): void {
    this.loadRules();
  }

  loadRules(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    this.crm
      .getBillingRules(this.partyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rules => {
          this.billingRules.set(rules);
          this.state.set('ready');
        },
        error: err => {
          this.state.set('error');
          this.errorKey.set(
            err?.status === 403
              ? 'CRM.BILLING_RULES.ERROR.FORBIDDEN'
              : 'CRM.BILLING_RULES.ERROR.LOAD',
          );
        },
      });
  }

  saveBillingRules(rules: Partial<BillingRules>): void {
    if (this.isSaving()) {
      return;
    }

    this.isSaving.set(true);

    this.crm
      .upsertBillingRules(this.partyId, rules)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedRules => {
          this.billingRules.set(updatedRules);
          this.isSaving.set(false);
          this.state.set('ready');
        },
        error: () => {
          this.isSaving.set(false);
          this.state.set('error');
          this.errorKey.set('CRM.BILLING_RULES.ERROR.SAVE');
        },
      });
  }

  backToParty(): void {
    this.router.navigate(['/app/crm/party', this.partyId]);
  }
}

export { BillingRulesPageComponent as BillingRulesComponent };
