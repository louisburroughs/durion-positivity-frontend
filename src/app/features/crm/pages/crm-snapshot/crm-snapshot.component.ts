import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { BillingRules, CrmSnapshot } from '../../models/crm.models';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Component({
  selector: 'app-crm-snapshot',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './crm-snapshot.component.html',
  styleUrl: './crm-snapshot.component.css',
})
export class CrmSnapshotPageComponent {
  private readonly crm = inject(CrmService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private refreshSub?: Subscription;

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly snapshot = signal<CrmSnapshot | null>(null);
  readonly billingRules = signal<BillingRules | null>(null);

  readonly partyId = computed(() => this.route.snapshot.paramMap.get('partyId') ?? '');

  readonly viewState = computed<'idle' | 'loading' | 'ready' | 'error'>(() => {
    const current = this.state();
    if (current === 'idle' || current === 'loading' || current === 'ready') {
      return current;
    }
    return 'error';
  });
  readonly errorType = signal<'validation' | 'forbidden' | 'not-found' | 'generic' | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly correlationId = signal<string | null>(null);

  readonly snapshotForm = this.fb.nonNullable.group({
    partyId: ['', Validators.pattern(UUID_PATTERN)],
    vehicleId: ['', Validators.pattern(UUID_PATTERN)],
  });

  readonly canLoad = computed(() => {
    const value = this.snapshotForm.getRawValue();
    return Boolean(
      (value.partyId || value.vehicleId) &&
      this.snapshotForm.valid &&
      this.state() !== 'loading',
    );
  });

  readonly canRefresh = computed(
    () =>
      this.snapshot() !== null &&
      !this.snapshotForm.invalid &&
      this.state() !== 'loading',
  );

  readonly partyTypeLabelKey = computed(() => {
    const type = this.snapshot()?.partyType ?? 'UNKNOWN';
    return `CRM.SNAPSHOT.PARTY_TYPE.${type}`;
  });

  constructor() {
    effect(
      (onCleanup) => {
        const routePartyId = this.partyId();
        if (!routePartyId) {
          return;
        }

        const sub: Subscription = this.loadByPartyId(routePartyId)
          .subscribe({
            next: ({ snapshot, billingRules }) => {
              this.snapshot.set(this.mergeSnapshotWithBillingRules(snapshot, billingRules));
              this.billingRules.set(billingRules);
              this.state.set(snapshot.partyId ? 'ready' : 'empty');
            },
            error: (err: HttpErrorResponse) => {
              this.snapshot.set(null);
              this.billingRules.set(null);
              this.state.set('error');
              this.errorKey.set('CRM.SNAPSHOT.ERROR.LOAD');
              this.mapError(err);
            },
          });
        onCleanup(() => sub.unsubscribe());
      },
      { allowSignalWrites: true },
    );
  }

  loadSnapshot(): void {
    const raw = this.snapshotForm.getRawValue();
    const partyId = raw.partyId.trim();
    const vehicleId = raw.vehicleId.trim();

    this.errorType.set(null);
    this.errorMessage.set(null);
    this.correlationId.set(null);
    this.errorKey.set(null);

    if (!partyId && !vehicleId) {
      this.state.set('error');
      this.errorKey.set('CRM.SNAPSHOT.ERROR.LOAD');
      this.errorType.set('validation');
      this.errorMessage.set('Enter a Party ID or Vehicle ID');
      return;
    }

    if (this.snapshotForm.invalid) {
      return;
    }

    const request$: Observable<{ snapshot: CrmSnapshot; billingRules: BillingRules | null }> = partyId
      ? forkJoin({
        snapshot: this.crm.fetchByParty(partyId),
        billingRules: this.crm.getBillingRules(partyId),
      })
      : this.crm.fetchByVehicle(vehicleId).pipe(
        switchMap(vehicleSnapshot => {
          if (!vehicleSnapshot.partyId) {
            return of({ snapshot: vehicleSnapshot, billingRules: null });
          }
          return forkJoin({
            snapshot: of(vehicleSnapshot),
            billingRules: this.crm.getBillingRules(vehicleSnapshot.partyId),
          });
        }),
      );

    this.state.set('loading');
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ snapshot, billingRules }) => {
        this.billingRules.set(billingRules);
        this.snapshot.set(this.mergeSnapshotWithBillingRules(snapshot, billingRules));
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => {
        this.snapshot.set(null);
        this.billingRules.set(null);
        this.state.set('error');
        this.errorKey.set('CRM.SNAPSHOT.ERROR.LOAD');
        this.mapError(err);
      },
    });
  }

  refresh(): void {
    const routePartyId = this.partyId();
    if (routePartyId) {
      this.refreshSub?.unsubscribe();
      this.refreshSub = this.loadByPartyId(routePartyId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ snapshot, billingRules }) => {
            this.snapshot.set(this.mergeSnapshotWithBillingRules(snapshot, billingRules));
            this.billingRules.set(billingRules);
            this.state.set(snapshot.partyId ? 'ready' : 'empty');
          },
          error: (err: HttpErrorResponse) => {
            this.snapshot.set(null);
            this.billingRules.set(null);
            this.state.set('error');
            this.errorKey.set('CRM.SNAPSHOT.ERROR.LOAD');
            this.mapError(err);
          },
        });
      return;
    }
    this.loadSnapshot();
  }

  clear(): void {
    this.snapshotForm.reset({ partyId: '', vehicleId: '' });
    this.snapshot.set(null);
    this.billingRules.set(null);
    this.errorType.set(null);
    this.errorMessage.set(null);
    this.correlationId.set(null);
    this.errorKey.set(null);
    this.state.set('idle');
  }

  private loadByPartyId(
    partyId: string,
  ): Observable<{ snapshot: CrmSnapshot; billingRules: BillingRules | null }> {
    this.state.set('loading');
    this.errorKey.set(null);
    this.errorType.set(null);
    this.errorMessage.set(null);
    this.correlationId.set(null);

    return forkJoin({
      snapshot: this.crm.fetchByParty(partyId),
      billingRules: this.crm.getBillingRules(partyId),
    });
  }

  private mergeSnapshotWithBillingRules(snapshot: CrmSnapshot, rules: BillingRules | null): CrmSnapshot {
    return {
      ...snapshot,
      partyType: snapshot.partyType ?? 'UNKNOWN',
      billingRules: rules ?? snapshot.billingRules,
    };
  }

  private mapError(err: HttpErrorResponse): void {
    const status = err?.status;
    const cid = err?.headers?.get('x-correlation-id') ?? err?.headers?.get('X-Correlation-Id');
    this.correlationId.set(cid);

    if (status === 403) {
      this.errorType.set('forbidden');
      this.errorMessage.set('You do not have access to this snapshot.');
      return;
    }
    if (status === 404) {
      this.errorType.set('not-found');
      this.errorMessage.set('No snapshot found for the provided identifier.');
      return;
    }
    if (status === 400) {
      this.errorType.set('validation');
      this.errorMessage.set('Invalid request. Verify Party ID or Vehicle ID.');
      return;
    }

    this.errorType.set('generic');
    this.errorMessage.set(err?.error?.message ?? 'Failed to load CRM snapshot.');
  }
}

export { CrmSnapshotPageComponent as CrmSnapshotComponent };
