import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { CrmService } from '../../services/crm.service';
import { CrmSnapshot, PartyDetail } from '../../models/crm.models';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Component({
  selector: 'app-crm-snapshot',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: '<section class="crm-snapshot-page"></section>',
})
export class CrmSnapshotComponent {
  private readonly crm = inject(CrmService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly viewState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly snapshot = signal<CrmSnapshot | null>(null);
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
        this.viewState() !== 'loading',
    );
  });

  readonly canRefresh = computed(
    () =>
      this.snapshot() !== null &&
      !this.snapshotForm.invalid &&
      this.viewState() !== 'loading',
  );

  loadSnapshot(): void {
    const raw = this.snapshotForm.getRawValue();
    const partyId = raw.partyId.trim();
    const vehicleId = raw.vehicleId.trim();

    this.errorType.set(null);
    this.errorMessage.set(null);
    this.correlationId.set(null);

    if (!partyId && !vehicleId) {
      this.viewState.set('error');
      this.errorType.set('validation');
      this.errorMessage.set('Enter a Party ID or Vehicle ID');
      return;
    }

    if (this.snapshotForm.invalid) {
      return;
    }

    this.viewState.set('loading');

    const request$: Observable<PartyDetail> = partyId
      ? this.crm.fetchPartySnapshot(partyId)
      : this.crm.fetchVehicleSnapshot(vehicleId);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.snapshot.set({
          account: response,
          contacts: response.contacts,
          vehicles: response.vehicles,
          preferences: undefined,
        });
        this.viewState.set('ready');
      },
      error: (err: HttpErrorResponse) => {
        this.snapshot.set(null);
        this.viewState.set('error');
        this.mapError(err);
      },
    });
  }

  refresh(): void {
    this.loadSnapshot();
  }

  clear(): void {
    this.snapshotForm.reset({ partyId: '', vehicleId: '' });
    this.snapshot.set(null);
    this.errorType.set(null);
    this.errorMessage.set(null);
    this.correlationId.set(null);
    this.viewState.set('idle');
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
