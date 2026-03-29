import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-bays-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './bays-page.component.html',
  styleUrl: './bays-page.component.css',
})
export class BaysPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly locationService = inject(LocationService);

  readonly loading = signal(false);
  readonly bays = signal<unknown[]>([]);
  readonly locationId = signal('');
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly createBayName = signal('');
  readonly selectedBay = signal<unknown>(null);
  readonly editBayName = signal('');
  readonly showEditModal = signal(false);

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = String(params['locationId'] ?? '');
      this.locationId.set(locationId);
      if (locationId) {
        this.loadBays(locationId);
      }
    });
  }

  loadBays(locationId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.locationService.listBays(locationId).subscribe({
      next: (bays) => {
        this.bays.set(bays);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('LOCATION.BAYS.ERROR.LOAD');
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.createBayName.set('');
    this.showCreateModal.set(true);
  }

  closeCreate(): void {
    this.showCreateModal.set(false);
  }

  submitCreate(): void {
    const locationId = this.locationId();
    const name = this.createBayName().trim();
    if (!locationId || !name) {
      this.error.set('LOCATION.BAYS.ERROR.NAME_REQUIRED');
      return;
    }

    this.locationService.createBay(locationId, { name }).subscribe({
      next: () => {
        this.closeCreate();
        this.loadBays(locationId);
      },
      error: () => this.error.set('LOCATION.BAYS.ERROR.CREATE'),
    });
  }

  selectBay(bay: unknown): void {
    const candidate = bay as Record<string, unknown>;
    this.selectedBay.set(bay);
    this.editBayName.set(String(candidate['name'] ?? candidate['bayName'] ?? ''));
    this.showEditModal.set(true);
  }

  closeEdit(): void {
    this.showEditModal.set(false);
    this.selectedBay.set(null);
  }

  submitEdit(): void {
    const locationId = this.locationId();
    const selectedBay = this.selectedBay() as Record<string, unknown> | null;
    const bayId = String(selectedBay?.['bayId'] ?? selectedBay?.['id'] ?? '');
    const name = this.editBayName().trim();

    if (!locationId || !bayId || !name) {
      this.error.set('LOCATION.BAYS.ERROR.BAY_AND_NAME_REQUIRED');
      return;
    }

    this.locationService.patchBay(locationId, bayId, { name }).subscribe({
      next: () => {
        this.closeEdit();
        this.loadBays(locationId);
      },
      error: () => this.error.set('LOCATION.BAYS.ERROR.UPDATE'),
    });
  }

  getBayName(bay: unknown): string {
    const candidate = bay as Record<string, unknown>;
    return String(candidate['name'] ?? candidate['bayName'] ?? candidate['bayId'] ?? 'Bay');
  }
}
