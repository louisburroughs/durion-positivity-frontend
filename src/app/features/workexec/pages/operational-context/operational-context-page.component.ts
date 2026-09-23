
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { WorkexecService } from '../../services/workexec.service';
import { OperationalContextResponse } from '../../models/workexec.models';

const RESOURCE_TYPES: ReadonlySet<string> = new Set(['BAY', 'MOBILE_UNIT', 'HOLD']);

/** `key` values translate, `date` values format through DatePipe, `text` values render as-is. */
type ContextValue =
  | { kind: 'text'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'key'; valueKey: string; params?: Record<string, unknown> };

export type ContextRow = { labelKey: string } & ContextValue;

@Component({
  selector: 'app-operational-context-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, DatePipe],
  templateUrl: './operational-context-page.component.html',
  styleUrl: './operational-context-page.component.css',
})
export class OperationalContextPageComponent implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly workexecService = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly workorderId = signal('');
  readonly context = signal<OperationalContextResponse | null>(null);
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
    this.workexecService.getOperationalContext(id).subscribe({
      next: (context) => {
        this.context.set(context);
        this.loading.set(false);
      },
      error: () => {
        this.overrideError.set(this.translate.instant('WORKEXEC.ERROR.LOAD_OPERATIONAL_CONTEXT'));
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
        this.context.set(response);
        this.overrideLoading.set(false);
        this.overrideSuccess.set(true);
        this.closeOverrideForm();
      },
      error: () => {
        this.overrideLoading.set(false);
        this.overrideError.set(this.translate.instant('WORKEXEC.ERROR.OVERRIDE_OPERATIONAL_CONTEXT'));
      },
    });
  }

  /**
   * Curated, translated rows. Related-entity ids (location, resource, mechanics) are
   * never rendered (issue #285); mechanics and resources show as counts instead.
   */
  readonly contextRows = computed<ContextRow[]>(() => {
    const c = this.context();
    if (!c) return [];
    const F = 'WORKEXEC.OPS_CONTEXT.FIELD.';
    const empty: ContextValue = { kind: 'key', valueKey: 'COMMON.EMPTY_VALUE' };
    const date = (value: string | undefined): ContextValue => (value ? { kind: 'date', value } : empty);
    const count = (items: readonly string[] | undefined): ContextValue =>
      ({ kind: 'key', valueKey: 'WORKEXEC.OPS_CONTEXT.ASSIGNED_COUNT', params: { count: items?.length ?? 0 } });
    const resourceType: ContextValue = c.resourceType && RESOURCE_TYPES.has(c.resourceType)
      ? { kind: 'key', valueKey: 'WORKEXEC.OPS_CONTEXT.RESOURCE_TYPE.' + c.resourceType }
      : empty;
    const constraints: ContextValue = c.constraints?.length
      ? { kind: 'text', value: c.constraints.join(', ') }
      : empty;
    const locked: ContextValue = { kind: 'key', valueKey: c.locked ? 'WORKEXEC.OPS_CONTEXT.LOCKED_YES' : 'WORKEXEC.OPS_CONTEXT.LOCKED_NO' };
    return [
      { labelKey: F + 'RESOURCE_TYPE', ...resourceType },
      { labelKey: F + 'SCHEDULED_START', ...date(c.scheduledStartAt) },
      { labelKey: F + 'SCHEDULED_END', ...date(c.scheduledEndAt) },
      { labelKey: F + 'LOCKED', ...locked },
      { labelKey: F + 'CONSTRAINTS', ...constraints },
      { labelKey: F + 'ASSIGNED_MECHANICS', ...count(c.assignedMechanics) },
      { labelKey: F + 'ASSIGNED_RESOURCES', ...count(c.assignedResources) },
    ];
  });
}
