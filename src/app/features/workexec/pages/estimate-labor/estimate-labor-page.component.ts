import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateItemResponse, EstimateResponse, PageState } from '../../models/workexec.models';
import { ProductCatalogService } from '../../../product/services/product-catalog.service';
import { ServiceSummary } from '../../../product/models/product.models';

/**
 * EstimateLaborPageComponent — Story 237 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId/labor
 * operationIds: addEstimateItem (LABOR), calculateEstimateTotals, getEstimateById, updateEstimateItem
 */
@Component({
  selector: 'app-estimate-labor-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './estimate-labor-page.component.html',
  styleUrl: './estimate-labor-page.component.css',
})
export class EstimateLaborPageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly catalog     = inject(ProductCatalogService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly fb         = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly state        = signal<PageState>('loading');
  readonly saveState    = signal<'idle' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate     = signal<EstimateResponse | null>(null);
  readonly items        = signal<EstimateItemResponse[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors  = signal<Record<string, string>>({});

  // Service catalog typeahead (name substring) — mirrors the estimate parts search.
  readonly searchQuery     = signal('');
  readonly searchState     = signal<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
  readonly searchResults   = signal<ServiceSummary[]>([]);
  readonly selectedService = signal<ServiceSummary | null>(null);
  readonly activeIndex     = signal(-1);
  private readonly searchChanges$ = new Subject<string>();

  estimateId = '';

  readonly addForm = this.fb.nonNullable.group({
    description: ['', Validators.required],
    quantity:    [1, [Validators.required, Validators.min(0.0001)]],
    unitPrice:   [0, [Validators.required, Validators.min(0)]],
    taxCode:     [''],
    serviceId:   [''],
    notes:       [''],
  });

  constructor() {
    this.searchChanges$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(query => this.runServiceSearch(query));
  }

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.loadEstimate();
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.activeIndex.set(-1);
    this.searchChanges$.next(query);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const results = this.searchResults();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.activeIndex();
      if (idx >= 0 && idx < results.length) {
        event.preventDefault();
        this.selectService(results[idx]);
      }
    } else if (event.key === 'Escape') {
      this.searchResults.set([]);
      this.searchState.set('idle');
      this.activeIndex.set(-1);
    }
  }

  private runServiceSearch(query: string): void {
    if (!query.trim()) {
      this.searchResults.set([]);
      this.searchState.set('idle');
      this.activeIndex.set(-1);
      return;
    }
    this.searchState.set('loading');
    this.catalog.searchServices(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: services => {
          this.searchResults.set(services);
          this.activeIndex.set(-1);
          this.searchState.set(services.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.searchResults.set([]);
          this.searchState.set('error');
        },
      });
  }

  selectService(service: ServiceSummary): void {
    this.selectedService.set(service);
    this.addForm.patchValue({ description: service.name, serviceId: service.id });
    this.searchResults.set([]);
    this.searchState.set('idle');
    this.activeIndex.set(-1);
    this.searchQuery.set(service.name);
  }

  clearSelectedService(): void {
    this.selectedService.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchState.set('idle');
    this.activeIndex.set(-1);
    this.addForm.patchValue({ serviceId: '' });
  }

  loadEstimate(): void {
    this.state.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.items.set(est.items ?? []);
          this.state.set('ready');
        },
        error: err => {
          this.state.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  addLaborItem(): void {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    this.saveState.set('saving');
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const { description, quantity, unitPrice, taxCode, serviceId } = this.addForm.getRawValue();

    this.workexec.addEstimateItem(this.estimateId, {
      itemType: 'LABOR',
      description,
      quantity,
      unitPrice,
      taxCode: taxCode || undefined,
      serviceId: serviceId || undefined,
    }).pipe(
      switchMap(() => this.workexec.calculateEstimateTotals(this.estimateId)),
      switchMap(() => this.workexec.getEstimateById(this.estimateId)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: est => {
        this.estimate.set(est);
        this.items.set(est.items ?? []);
        this.saveState.set('success');
        this.addForm.reset({ quantity: 1, unitPrice: 0 });
        this.selectedService.set(null);
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.searchState.set('idle');
        this.activeIndex.set(-1);
      },
      error: err => {
        this.saveState.set('error');
        const body = err.error;
        if (body?.fieldErrors?.length) {
          const map: Record<string, string> = {};
          for (const fe of body.fieldErrors) map[fe.field] = fe.message;
          this.fieldErrors.set(map);
        } else if (err.status === 409) {
          this.errorMessage.set('Estimate is not in DRAFT status and cannot be edited.');
        } else {
          this.errorMessage.set(body?.message ?? 'Failed to add labor item.');
        }
      },
    });
  }

  fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }
}
