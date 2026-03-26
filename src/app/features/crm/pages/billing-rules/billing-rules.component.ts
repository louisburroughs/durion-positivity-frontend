import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CrmService } from '../../services/crm.service';
import {
  BillingRule,
  CreateBillingRuleRequest,
} from '../../models/crm.models';

@Component({
  selector: 'app-billing-rules',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './billing-rules.component.html',
  styleUrl: './billing-rules.component.css',
})
export class BillingRulesComponent implements OnInit {
  private readonly crm = inject(CrmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<'loading' | 'ready' | 'error'>('loading');
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
    this.pageState.set('loading');
    this.crm
      .getBillingRules(this.partyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rules => {
          this.rules.set(rules);
          this.pageState.set('ready');
        },
        error: () => this.pageState.set('error'),
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
      effectiveStart: rule.effectiveStart,
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
    const request: CreateBillingRuleRequest = {
      name: formValue.name,
      status: formValue.status as 'ACTIVE' | 'INACTIVE',
      priority: formValue.priority,
      effectiveStart: formValue.effectiveStart,
      effectiveEnd: formValue.effectiveEnd || undefined,
      billingMethod: formValue.billingMethod || undefined,
      billingSchedule: formValue.billingSchedule || undefined,
      conditions: formValue.conditions || undefined,
      earningsProcessing: formValue.earningsProcessing || undefined,
      notes: formValue.notes || undefined,
    };

    if (this.panelState() === 'add') {
      // TODO: wire createBillingRule when operation_ids are added to workset.
      const localRule: BillingRule = {
        ruleId: crypto.randomUUID(),
        name: request.name,
        status: request.status,
        priority: request.priority,
        effectiveStart: request.effectiveStart,
        effectiveEnd: request.effectiveEnd,
        billingMethod: request.billingMethod,
        billingSchedule: request.billingSchedule,
        conditions: request.conditions,
        earningsProcessing: request.earningsProcessing,
        notes: request.notes,
        lastUpdated: new Date().toISOString(),
      };
      this.rules.update(rules => [localRule, ...rules]);
      this.closePanel();
      return;
    }

    if (this.panelState() === 'edit') {
      const current = this.editingRule();
      if (!current) {
        this.panelError.set('No billing rule selected for editing.');
        this.panelPending.set(false);
        return;
      }

      // TODO: wire updateBillingRule when operation_ids are added to workset.
      this.rules.update(rules =>
        rules.map(rule =>
          rule.ruleId === current.ruleId
            ? {
                ...rule,
                ...request,
                effectiveEnd: request.effectiveEnd,
                billingMethod: request.billingMethod,
                billingSchedule: request.billingSchedule,
                conditions: request.conditions,
                earningsProcessing: request.earningsProcessing,
                notes: request.notes,
                lastUpdated: new Date().toISOString(),
              }
            : rule,
        ),
      );
      this.closePanel();
      return;
    }

    this.panelPending.set(false);
  }

  confirmDelete(ruleId: string): void {
    this.deleteConfirmRuleId.set(ruleId);
  }

  cancelDelete(): void {
    this.deleteConfirmRuleId.set(null);
  }

  deleteRule(ruleId: string): void {
    // TODO: wire deleteBillingRule when operation_ids are added to workset.
    this.rules.update(rules => rules.filter(rule => rule.ruleId !== ruleId));
    this.deleteConfirmRuleId.set(null);
  }

  backToParty(): void {
    this.router.navigate(['/app/crm/party', this.partyId]);
  }
}
