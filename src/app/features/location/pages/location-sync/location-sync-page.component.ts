import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { InventoryService } from '../../services/inventory.service';

@Component({
  selector: 'app-location-sync-page',
  standalone: true,
  imports: [],
  templateUrl: './location-sync-page.component.html',
  styleUrl: './location-sync-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationSyncPageComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly inventoryLocations = signal<unknown[]>([]);
  readonly syncLogs = signal<unknown[]>([]);
  readonly loading = signal(false);
  readonly syncLogsLoading = signal(false);
  readonly inventoryLocationsError = signal<string | null>(null);
  readonly syncLogsError = signal<string | null>(null);
  readonly triggerSuccess = signal(false);
  readonly triggerError = signal<string | null>(null);
  readonly triggering = signal(false);
  readonly lastSyncRunId = signal<string | null>(null);

  readonly canTriggerSync = computed(() => !this.triggering());

  constructor() {
    this.loadInventoryLocations();
    this.loadSyncLogs();
  }

  loadInventoryLocations(): void {
    this.loading.set(true);
    this.inventoryLocationsError.set(null);

    this.inventoryService.listInventoryLocations({ pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.inventoryLocations.set(this.normalizeItems(response));
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.inventoryLocationsError.set(this.errorMessage(err, 'Failed to load inventory locations.'));
          this.loading.set(false);
        },
      });
  }

  loadSyncLogs(): void {
    this.syncLogsLoading.set(true);
    this.syncLogsError.set(null);

    this.inventoryService.listSyncLogs({ pageSize: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.syncLogs.set(this.normalizeItems(response));
          this.syncLogsLoading.set(false);
        },
        error: (err: unknown) => {
          this.syncLogsError.set(this.errorMessage(err, 'Failed to load sync logs.'));
          this.syncLogsLoading.set(false);
        },
      });
  }

  triggerSync(): void {
    if (!this.canTriggerSync()) {
      return;
    }

    this.triggering.set(true);
    this.triggerError.set(null);
    this.triggerSuccess.set(false);

    this.inventoryService.triggerLocationSync(uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const payload = this.toRecord(response);
          const syncRunId = payload?.['syncRunId'];
          this.lastSyncRunId.set(typeof syncRunId === 'string' ? syncRunId : null);
          this.triggerSuccess.set(true);
          this.triggering.set(false);
          timer(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadSyncLogs());
        },
        error: (err: unknown) => {
          this.triggerError.set(this.errorMessage(err, 'Failed to trigger location sync.'));
          this.triggering.set(false);
        },
      });
  }

  private normalizeItems(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    const payload = this.toRecord(response);
    const items = payload?.['items'];
    return Array.isArray(items) ? items : [];
  }

  private errorMessage(err: unknown, fallback: string): string {
    const payload = this.toRecord(this.toRecord(err)?.['error']);
    const message = payload?.['message'];
    return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
  }
}
