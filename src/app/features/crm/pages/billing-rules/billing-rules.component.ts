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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CrmService } from '../../services/crm.service';
import {
  BillingRules,
  BillingRule,
} from '../../models/crm.models';

@Component({
  selector: 'app-billing-rules',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './billing-rules.component.html',
  styleUrl: './billing-rules.component.css',
})
export class BillingRulesPageComponent implements OnInit {
  private readonly crm = inject(CrmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
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
  readonly rules = signal<BillingRule[]>([]);
  readonly panelState = signal<'closed' | 'add' | 'edit'>('closed');
  readonly editingRule = signal<BillingRule | null>(null);
  readonly panelError = signal<string | null>(null);
  readonly panelPending = signal<boolean>(false);
  readonly deleteConfirmRuleId = signal<string | null>(null);

  readonly ruleForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    status: ['ACTIVE', Validators.required],
    priority: [1],
    effectiveStart: ['', Validators.required],
    effectiveEnd: [''],
    billingMethod: [''],
    billingSchedule: [''],
    conditions: [''],
    earningsProcessing: [''],
    notes: [''],
  });

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
          this.rules.set([this.toDisplayRule(rules)]);
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

  openAdd(): void {
    this.ruleForm.reset({
      name: '',
      status: 'ACTIVE',
      priority: 1,
      effectiveStart: '',
      effectiveEnd: '',
      billingMethod: '',
      billingSchedule: '',
      conditions: '',
      earningsProcessing: '',
      notes: '',
    });
    this.editingRule.set(null);
    this.panelError.set(null);
    this.panelPending.set(false);
    this.panelState.set('add');
  }

  openEdit(rule: BillingRule): void {
    this.editingRule.set(rule);
    this.panelError.set(null);
    this.panelPending.set(false);
    this.ruleForm.reset({
      name: rule.name,
      status: rule.status,
      priority: rule.priority ?? 1,
      effectiveStart: rule.effectiveStart ?? '',
      effectiveEnd: rule.effectiveEnd ?? '',
      billingMethod: rule.billingMethod ?? '',
      billingSchedule: rule.billingSchedule ?? '',
      conditions: rule.conditions ?? '',
      earningsProcessing: rule.earningsProcessing ?? '',
      notes: rule.notes ?? '',
    });
    this.panelState.set('edit');
  }

  closePanel(): void {
    this.panelState.set('closed');
    this.panelError.set(null);
    this.panelPending.set(false);
  }

  saveRule(): void {
    if (this.ruleForm.invalid || this.panelPending()) {
      return;
    }

    this.panelPending.set(true);
    this.panelError.set(null);

    const formValue = this.ruleForm.getRawValue();
    this.saveBillingRules({
      requirePo: this.billingRules()?.requirePo ?? false,
      paymentTerms:
        formValue.billingSchedule || this.billingRules()?.paymentTerms || 'NET_30',
      creditLimit:
        formValue.priority === null || formValue.priority === undefined
          ? this.billingRules()?.creditLimit
          : Number(formValue.priority),
      notes: formValue.notes || undefined,
    });
  }

  confirmDelete(ruleId: string): void {
    this.deleteConfirmRuleId.set(ruleId);
  }

  cancelDelete(): void {
    this.deleteConfirmRuleId.set(null);
  }

  deleteRule(ruleId: string): void {
    this.rules.update(rules => rules.filter(rule => rule.ruleId !== ruleId));
    this.deleteConfirmRuleId.set(null);
  }

  saveBillingRules(rules: Partial<BillingRules>): void {
    if (this.panelPending()) {
      return;
    }

    this.panelPending.set(true);
    this.panelError.set(null);

    this.crm
      .upsertBillingRules(this.partyId, rules)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedRules => {
          this.billingRules.set(updatedRules);
          this.rules.set([this.toDisplayRule(updatedRules)]);
          this.panelPending.set(false);
          this.panelState.set('closed');
          this.state.set('ready');
        },
        error: () => {
          this.panelPending.set(false);
          this.state.set('error');
          this.errorKey.set('CRM.BILLING_RULES.ERROR.SAVE');
        },
      });
  }

  private toDisplayRule(rules: BillingRules): BillingRule {
    return {
      ruleId: this.partyId,
      name: 'CRM.BILLING_RULES.RULE_DEFAULT_NAME',
      status: 'ACTIVE',
      priority: rules.creditLimit,
      effectiveStart: undefined,
      effectiveEnd: undefined,
      billingMethod: rules.requirePo ? 'PO_REQUIRED' : 'NO_PO_REQUIRED',
      billingSchedule: rules.paymentTerms,
      conditions: undefined,
      earningsProcessing: undefined,
      notes: rules.notes,
      lastUpdated: rules.updatedAt,
    };
  }

  backToParty(): void {
    this.router.navigate(['/app/crm/party', this.partyId]);
  }
}

export { BillingRulesPageComponent as BillingRulesComponent };
