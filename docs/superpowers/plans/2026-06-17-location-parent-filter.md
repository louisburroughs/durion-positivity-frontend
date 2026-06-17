# Location Parent-Location Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable searchable location-picker to the location module's mobile-units, bays, and storage-locations pages so users pick a parent location (URL-synced) to scope what they search/edit.

**Architecture:** One standalone `LocationPickerComponent` (typeahead over `getAllLocations()`) emits a selected location id and an `invalidSelection` event. Each page hosts the picker, mirrors the selection into the `?locationId` query param, requires a selection before listing, and loads its children on selection. mobile-units fetches all units and filters client-side by `baseLocationId`.

**Tech Stack:** Angular standalone components, signals, `@angular/router` (ActivatedRoute/Router), ngx-translate `TranslatePipe`, Vitest via `@angular/build:unit-test`.

---

## Conventions for this plan

- Spec: `docs/superpowers/specs/2026-06-17-location-parent-filter-design.md`.
- Branch: `feat/location-parent-filter` (already created; spec already committed).
- Run a single suite isolated (avoids a pre-existing TestBed pollution cascade in the full run):
  `npx ng test --no-watch --filter "<SuiteName>"`.
- Verify the production build with: `npm run build -- --configuration alpha`.
- SDK type for locations: `LocationResponseDTO` from `@durion-sdk/location`
  (`id`, `name`, `code`, `addressLine1`, `addressLine2`, `city`, `state`, `postalCode`,
  `mailingAddress`, `active`).
- `LocationService.getAllLocations()` returns `Observable<unknown[]>`.

---

## File structure

- **Create** `src/app/features/location/components/location-picker/location-picker.component.ts`
  — typeahead logic (load, filter, select, keyboard, invalid-id resolution).
- **Create** `src/app/features/location/components/location-picker/location-picker.component.html`
  — input + suggestion listbox.
- **Create** `src/app/features/location/components/location-picker/location-picker.component.css`
  — minimal styles (reuse existing typeahead class names where practical).
- **Create** `src/app/features/location/components/location-picker/location-picker.component.spec.ts`
  — unit specs.
- **Modify** `src/app/features/location/pages/bays/bays-page.component.ts` + `.html` + `.spec.ts`.
- **Modify** `src/app/features/location/pages/storage-locations/storage-locations-page.component.ts` + `.html` + `.spec.ts`.
- **Modify** `src/app/features/location/pages/mobile-units/mobile-units-page.component.ts` + `.html` + `.spec.ts`.

---

## Task 1: LocationPickerComponent

**Files:**
- Create: `src/app/features/location/components/location-picker/location-picker.component.ts`
- Create: `src/app/features/location/components/location-picker/location-picker.component.html`
- Create: `src/app/features/location/components/location-picker/location-picker.component.css`
- Test: `src/app/features/location/components/location-picker/location-picker.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `location-picker.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationPickerComponent } from './location-picker.component';
import { LocationService } from '../../services/location.service';

const locations = [
  { id: 'loc-1', name: 'Charlotte Depot', code: 'CLT', mailingAddress: '100 Main St, Charlotte, NC' },
  { id: 'loc-2', name: 'Raleigh Yard', code: 'RAL', addressLine1: '5 Oak Ave', city: 'Raleigh', state: 'NC' },
];

const locationServiceStub = { getAllLocations: vi.fn() };

describe('LocationPickerComponent', () => {
  let fixture: ComponentFixture<LocationPickerComponent>;
  let component: LocationPickerComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.getAllLocations.mockReturnValue(of(locations));

    await TestBed.configureTestingModule({
      imports: [LocationPickerComponent],
      providers: [{ provide: LocationService, useValue: locationServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('filters by name, code, and address', () => {
    component.onInput('raleigh');
    expect(component.suggestions().map(l => l.id)).toEqual(['loc-2']);
    component.onInput('CLT');
    expect(component.suggestions().map(l => l.id)).toEqual(['loc-1']);
    component.onInput('oak');
    expect(component.suggestions().map(l => l.id)).toEqual(['loc-2']);
  });

  it('exposes an address line for a suggestion', () => {
    expect(component.addressOf(locations[0])).toBe('100 Main St, Charlotte, NC');
    expect(component.addressOf(locations[1])).toBe('5 Oak Ave, Raleigh, NC');
  });

  it('emits locationSelected with the id on select', () => {
    const spy = vi.fn();
    component.locationSelected.subscribe(spy);
    component.select(locations[1]);
    expect(spy).toHaveBeenCalledWith('loc-2');
    expect(component.displayValue()).toBe('Raleigh Yard');
  });

  it('preselects a valid selectedId by showing its name', () => {
    fixture.componentRef.setInput('selectedId', 'loc-1');
    fixture.detectChanges();
    expect(component.displayValue()).toBe('Charlotte Depot');
  });

  it('emits invalidSelection when selectedId is unknown after load', () => {
    const spy = vi.fn();
    component.invalidSelection.subscribe(spy);
    fixture.componentRef.setInput('selectedId', 'nope');
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith('nope');
    expect(component.displayValue()).toBe('');
  });

  it('shows an error state when locations fail to load', () => {
    locationServiceStub.getAllLocations.mockReturnValue(throwError(() => ({ status: 500 })));
    const fx = TestBed.createComponent(LocationPickerComponent);
    fx.detectChanges();
    expect(fx.componentInstance.loadError()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --no-watch --filter "LocationPickerComponent"`
Expected: FAIL — cannot find module `./location-picker.component`.

- [ ] **Step 3: Write the component HTML**

Create `location-picker.component.html`:

```html
<div class="location-picker">
  <label class="location-picker__label" [attr.for]="inputId">{{ label }}</label>
  <input
    [id]="inputId"
    type="text"
    class="location-picker__input"
    role="combobox"
    aria-autocomplete="list"
    [attr.aria-expanded]="open() && suggestions().length > 0"
    [attr.aria-controls]="listId"
    [value]="displayValue()"
    [placeholder]="placeholder"
    (input)="onInput($any($event.target).value)"
    (focus)="onFocus()"
    (blur)="onBlur()"
    (keydown)="onKeydown($event)"
  />
  @if (loadError()) {
    <p class="location-picker__error" role="alert">{{ errorText }}</p>
  }
  @if (open() && suggestions().length > 0) {
    <ul class="location-picker__list" [id]="listId" role="listbox">
      @for (loc of suggestions(); track loc.id; let i = $index) {
        <li
          class="location-picker__item"
          [class.location-picker__item--active]="i === activeIndex()"
          role="option"
          [attr.aria-selected]="i === activeIndex()"
          (mousedown)="select(loc)"
        >
          <span class="location-picker__primary">{{ loc.name || loc.code }}</span>
          @if (addressOf(loc)) {
            <span class="location-picker__secondary">{{ addressOf(loc) }}</span>
          }
        </li>
      }
    </ul>
  }
</div>
```

- [ ] **Step 4: Write the component CSS**

Create `location-picker.component.css`:

```css
.location-picker { position: relative; display: flex; flex-direction: column; gap: 0.25rem; max-width: 28rem; }
.location-picker__label { font-weight: 600; font-size: 0.875rem; }
.location-picker__input { padding: 0.5rem 0.75rem; border: 1px solid var(--border-color, #ccc); border-radius: 0.375rem; font-size: 0.95rem; }
.location-picker__error { color: var(--error-color, #b00020); font-size: 0.8rem; margin: 0; }
.location-picker__list { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; margin: 0.25rem 0 0; padding: 0; list-style: none; max-height: 16rem; overflow-y: auto; background: var(--surface-color, #fff); border: 1px solid var(--border-color, #ccc); border-radius: 0.375rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12); }
.location-picker__item { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; cursor: pointer; }
.location-picker__item--active, .location-picker__item:hover { background: var(--hover-color, #eef2ff); }
.location-picker__primary { font-weight: 600; }
.location-picker__secondary { font-size: 0.8rem; color: var(--muted-color, #666); }
```

- [ ] **Step 5: Write the component TS**

Create `location-picker.component.ts`:

```typescript
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  Output,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocationService } from '../../services/location.service';

interface PickerLocation {
  id: string;
  name?: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  mailingAddress?: string;
}

let pickerSeq = 0;

@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './location-picker.component.html',
  styleUrl: './location-picker.component.css',
})
export class LocationPickerComponent {
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() label = 'Location';
  @Input() placeholder = 'Search locations by name, code, or address…';
  @Input() errorText = 'Failed to load locations.';

  private readonly _selectedId = signal('');
  @Input() set selectedId(value: string | null | undefined) {
    this._selectedId.set(value ?? '');
  }

  @Output() readonly locationSelected = new EventEmitter<string>();
  @Output() readonly invalidSelection = new EventEmitter<string>();

  private readonly seq = ++pickerSeq;
  readonly inputId = `location-picker-input-${this.seq}`;
  readonly listId = `location-picker-list-${this.seq}`;

  readonly all = signal<PickerLocation[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal(false);
  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(-1);
  private readonly typed = signal(false);

  readonly displayValue = computed(() => {
    if (this.typed()) {
      return this.query();
    }
    const id = this._selectedId();
    const match = this.all().find(l => l.id === id);
    return match ? (match.name || match.code || '') : '';
  });

  readonly suggestions = computed<PickerLocation[]>(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.all();
    if (!q) {
      return list.slice(0, 50);
    }
    return list
      .filter(l =>
        (l.name ?? '').toLowerCase().includes(q) ||
        (l.code ?? '').toLowerCase().includes(q) ||
        this.addressOf(l).toLowerCase().includes(q),
      )
      .slice(0, 50);
  });

  constructor() {
    this.locationService.getAllLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.all.set((rows as PickerLocation[]).filter(r => !!r?.id));
          this.loaded.set(true);
        },
        error: () => {
          this.loadError.set(true);
          this.loaded.set(true);
        },
      });

    // Validate selectedId once locations are loaded.
    effect(() => {
      const id = this._selectedId();
      if (!this.loaded() || !id || this.typed()) {
        return;
      }
      if (!this.all().some(l => l.id === id)) {
        this.invalidSelection.emit(id);
      }
    });
  }

  addressOf(loc: PickerLocation): string {
    if (loc.mailingAddress && loc.mailingAddress.trim()) {
      return loc.mailingAddress.trim();
    }
    return [loc.addressLine1, loc.city, loc.state].filter(Boolean).join(', ');
  }

  onInput(value: string): void {
    this.typed.set(true);
    this.query.set(value);
    this.open.set(true);
    this.activeIndex.set(-1);
  }

  onFocus(): void {
    if (this.all().length > 0) {
      this.open.set(true);
    }
  }

  onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.suggestions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
      this.activeIndex.set(Math.min(this.activeIndex() + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.activeIndex();
      if (idx >= 0 && idx < items.length) {
        event.preventDefault();
        this.select(items[idx]);
      }
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  select(loc: PickerLocation): void {
    this.typed.set(false);
    this.query.set('');
    this._selectedId.set(loc.id);
    this.open.set(false);
    this.activeIndex.set(-1);
    this.locationSelected.emit(loc.id);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx ng test --no-watch --filter "LocationPickerComponent"`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/features/location/components/location-picker/
git commit -m "feat(location): add reusable LocationPickerComponent typeahead"
```

---

## Task 2: Wire the bays page

**Files:**
- Modify: `src/app/features/location/pages/bays/bays-page.component.ts`
- Modify: `src/app/features/location/pages/bays/bays-page.component.html`
- Test: `src/app/features/location/pages/bays/bays-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create/replace `bays-page.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaysPageComponent } from './bays-page.component';
import { LocationService } from '../../services/location.service';

const locationServiceStub = {
  getAllLocations: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }])),
  listBays: vi.fn().mockReturnValue(of([{ id: 'bay-1', name: 'Bay 1' }])),
};

describe('BaysPageComponent', () => {
  let fixture: ComponentFixture<BaysPageComponent>;
  let component: BaysPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.listBays.mockReturnValue(of([{ id: 'bay-1', name: 'Bay 1' }]));

    await TestBed.configureTestingModule({
      imports: [BaysPageComponent],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BaysPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not load bays before a location is selected', () => {
    expect(component.locationId()).toBe('');
    expect(locationServiceStub.listBays).not.toHaveBeenCalled();
  });

  it('loads bays and writes the query param on selection', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    component.onLocationSelected('loc-1');
    expect(component.locationId()).toBe('loc-1');
    expect(locationServiceStub.listBays).toHaveBeenCalledWith('loc-1');
    expect(navSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { locationId: 'loc-1' },
      queryParamsHandling: 'merge',
    }));
  });

  it('shows a not-found notice and resets on invalid id', () => {
    component.onLocationSelected('loc-1');
    component.onInvalidSelection('bad-id');
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(true);
    expect(component.bays()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --no-watch --filter "BaysPageComponent"`
Expected: FAIL — `onLocationSelected` / `onInvalidSelection` / `invalidId` not defined.

- [ ] **Step 3: Update the component TS**

Replace the body of `bays-page.component.ts` with:

```typescript
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LocationService } from '../../services/location.service';
import { LocationPickerComponent } from '../../components/location-picker/location-picker.component';

@Component({
  selector: 'app-bays-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, LocationPickerComponent],
  templateUrl: './bays-page.component.html',
  styleUrl: './bays-page.component.css',
})
export class BaysPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locationService = inject(LocationService);

  readonly loading = signal(false);
  readonly bays = signal<unknown[]>([]);
  readonly locationId = signal('');
  readonly invalidId = signal(false);
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly createBayName = signal('');
  readonly selectedBay = signal<unknown>(null);
  readonly editBayName = signal('');
  readonly showEditModal = signal(false);

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = String(params['locationId'] ?? '');
      if (locationId === this.locationId()) {
        return;
      }
      this.locationId.set(locationId);
      if (locationId) {
        this.loadBays(locationId);
      } else {
        this.bays.set([]);
      }
    });
  }

  onLocationSelected(locationId: string): void {
    this.invalidId.set(false);
    this.locationId.set(locationId);
    this.router.navigate([], {
      queryParams: { locationId },
      queryParamsHandling: 'merge',
    });
    this.loadBays(locationId);
  }

  onInvalidSelection(_id: string): void {
    this.invalidId.set(true);
    this.locationId.set('');
    this.bays.set([]);
    this.router.navigate([], {
      queryParams: { locationId: null },
      queryParamsHandling: 'merge',
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
```

- [ ] **Step 4: Add the picker + prompt to the template**

At the top of `bays-page.component.html`, immediately inside the page's root container (before the bays list/table markup), insert:

```html
<app-location-picker
  label="Location"
  [selectedId]="locationId()"
  (locationSelected)="onLocationSelected($event)"
  (invalidSelection)="onInvalidSelection($event)"
></app-location-picker>

@if (invalidId()) {
  <p class="field-error" role="alert">Location not found — select another.</p>
}

@if (!locationId()) {
  <p class="empty-state">Select a location to view and edit its bays.</p>
}
```

Then wrap the EXISTING bays list/content block (everything that renders bays, the
"+ create" button, and modals trigger) so it only shows when a location is chosen.
Find the existing top-level content wrapper and guard it: add `@if (locationId()) { … }`
around the bays list section. Leave the create/edit modal markup outside the guard so
dialogs still render.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx ng test --no-watch --filter "BaysPageComponent"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/location/pages/bays/
git commit -m "feat(location): parent-location picker on bays page"
```

---

## Task 3: Wire the storage-locations page

**Files:**
- Modify: `src/app/features/location/pages/storage-locations/storage-locations-page.component.ts`
- Modify: `src/app/features/location/pages/storage-locations/storage-locations-page.component.html`
- Test: `src/app/features/location/pages/storage-locations/storage-locations-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create/replace `storage-locations-page.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageLocationsPageComponent } from './storage-locations-page.component';
import { InventoryService } from '../../services/inventory.service';
import { LocationService } from '../../services/location.service';

const inventoryStub = {
  listStorageLocations: vi.fn().mockReturnValue(of({ items: [{ id: 's-1' }] })),
  listStorageTypes: vi.fn().mockReturnValue(of({ items: [] })),
  createStorageLocation: vi.fn(),
  deactivateStorageLocation: vi.fn(),
};
const locationServiceStub = {
  getAllLocations: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }])),
};

describe('StorageLocationsPageComponent', () => {
  let fixture: ComponentFixture<StorageLocationsPageComponent>;
  let component: StorageLocationsPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    inventoryStub.listStorageLocations.mockReturnValue(of({ items: [{ id: 's-1' }] }));

    await TestBed.configureTestingModule({
      imports: [StorageLocationsPageComponent],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: inventoryStub },
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StorageLocationsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not load storage locations before a location is selected', () => {
    expect(component.locationId()).toBe('');
    expect(inventoryStub.listStorageLocations).not.toHaveBeenCalled();
  });

  it('loads and writes the query param on selection', () => {
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    component.onLocationSelected('loc-1');
    expect(component.locationId()).toBe('loc-1');
    expect(inventoryStub.listStorageLocations).toHaveBeenCalledWith('loc-1', { pageSize: 50 });
    expect(navSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { locationId: 'loc-1' },
      queryParamsHandling: 'merge',
    }));
  });

  it('resets on invalid id', () => {
    component.onLocationSelected('loc-1');
    component.onInvalidSelection('bad');
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(true);
    expect(component.storageLocations()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --no-watch --filter "StorageLocationsPageComponent"`
Expected: FAIL — `onLocationSelected` / `onInvalidSelection` / `invalidId` not defined.

- [ ] **Step 3: Update the component TS**

In `storage-locations-page.component.ts`:

3a. Update imports + decorator. Replace lines 1-21 (the import block and `@Component`) so
the component imports the picker, `CommonModule`, `Router`, and keeps existing imports:

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { InventoryService } from '../../services/inventory.service';
import { LocationService } from '../../services/location.service';
import { LocationPickerComponent } from '../../components/location-picker/location-picker.component';

@Component({
  selector: 'app-storage-locations-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LocationPickerComponent],
  templateUrl: './storage-locations-page.component.html',
  styleUrl: './storage-locations-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

3b. Add `private readonly router = inject(Router);` next to the other `inject(...)` lines
and add `readonly invalidId = signal(false);` next to the other signals.

3c. Replace the `constructor()` (lines 53-67) with a query-param sync that no longer
auto-fetches `getAllLocations` (the picker owns that):

```typescript
  constructor() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const routeLocationId = String(params['locationId'] ?? '');
        if (routeLocationId === this.locationId()) {
          return;
        }
        this.locationId.set(routeLocationId);
        this.createForm.controls.locationId.setValue(routeLocationId);
        if (!routeLocationId) {
          this.storageLocations.set([]);
          return;
        }
        this.loadStorageLocations();
        this.loadStorageTypes();
      });
  }

  onLocationSelected(locationId: string): void {
    this.invalidId.set(false);
    this.locationId.set(locationId);
    this.createForm.controls.locationId.setValue(locationId);
    this.router.navigate([], { queryParams: { locationId }, queryParamsHandling: 'merge' });
    this.loadStorageLocations();
    this.loadStorageTypes();
  }

  onInvalidSelection(_id: string): void {
    this.invalidId.set(true);
    this.locationId.set('');
    this.storageLocations.set([]);
    this.router.navigate([], { queryParams: { locationId: null }, queryParamsHandling: 'merge' });
  }
```

- [ ] **Step 4: Add the picker + prompt to the template**

At the top of `storage-locations-page.component.html`, inside the root container before
the existing content, insert:

```html
<app-location-picker
  label="Location"
  [selectedId]="locationId()"
  (locationSelected)="onLocationSelected($event)"
  (invalidSelection)="onInvalidSelection($event)"
></app-location-picker>

@if (invalidId()) {
  <p class="field-error" role="alert">Location not found — select another.</p>
}

@if (!locationId()) {
  <p class="empty-state">Select a location to view and edit its storage locations.</p>
}
```

Then guard the existing storage-locations content block (list, create form trigger) with
`@if (locationId()) { … }`. Keep dialog markup rendering regardless.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx ng test --no-watch --filter "StorageLocationsPageComponent"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/location/pages/storage-locations/
git commit -m "feat(location): parent-location picker on storage-locations page"
```

---

## Task 4: Wire the mobile-units page (client-side baseLocationId filter)

**Files:**
- Modify: `src/app/features/location/pages/mobile-units/mobile-units-page.component.ts`
- Modify: `src/app/features/location/pages/mobile-units/mobile-units-page.component.html`
- Test: `src/app/features/location/pages/mobile-units/mobile-units-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create/replace `mobile-units-page.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileUnitsPageComponent } from './mobile-units-page.component';
import { LocationService } from '../../services/location.service';

const units = [
  { id: 'u-1', name: 'Van A', baseLocationId: 'loc-1' },
  { id: 'u-2', name: 'Van B', baseLocationId: 'loc-2' },
  { id: 'u-3', name: 'Van C', baseLocationId: 'loc-1' },
];

const locationServiceStub = {
  getAllLocations: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }])),
  listMobileUnits: vi.fn().mockReturnValue(of(units)),
};

describe('MobileUnitsPageComponent', () => {
  let fixture: ComponentFixture<MobileUnitsPageComponent>;
  let component: MobileUnitsPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.listMobileUnits.mockReturnValue(of(units));

    await TestBed.configureTestingModule({
      imports: [MobileUnitsPageComponent],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileUnitsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows no units before a location is selected', () => {
    expect(component.locationId()).toBe('');
    expect(component.mobileUnits()).toEqual([]);
  });

  it('filters units by baseLocationId on selection and writes the query param', () => {
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    component.onLocationSelected('loc-1');
    expect(component.mobileUnits().map((u: any) => u.id)).toEqual(['u-1', 'u-3']);
    expect(navSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { locationId: 'loc-1' },
      queryParamsHandling: 'merge',
    }));
  });

  it('resets on invalid id', () => {
    component.onLocationSelected('loc-1');
    component.onInvalidSelection('bad');
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(true);
    expect(component.mobileUnits()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --no-watch --filter "MobileUnitsPageComponent"`
Expected: FAIL — `locationId` / `onLocationSelected` / `onInvalidSelection` not defined.

- [ ] **Step 3: Update the component TS**

Replace the body of `mobile-units-page.component.ts` with:

```typescript
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LocationService } from '../../services/location.service';
import { LocationPickerComponent } from '../../components/location-picker/location-picker.component';

@Component({
  selector: 'app-mobile-units-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, LocationPickerComponent],
  templateUrl: './mobile-units-page.component.html',
  styleUrl: './mobile-units-page.component.css',
})
export class MobileUnitsPageComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly mobileUnits = signal<unknown[]>([]);
  private readonly allUnits = signal<unknown[]>([]);
  readonly locationId = signal('');
  readonly invalidId = signal(false);
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly selectedUnit = signal<unknown>(null);
  readonly showCoverageModal = signal(false);

  readonly createName = signal('');
  readonly coverageRegion = signal('');

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = String(params['locationId'] ?? '');
      if (locationId === this.locationId()) {
        return;
      }
      this.locationId.set(locationId);
      if (locationId) {
        this.loadMobileUnits(locationId);
      } else {
        this.mobileUnits.set([]);
      }
    });
  }

  onLocationSelected(locationId: string): void {
    this.invalidId.set(false);
    this.locationId.set(locationId);
    this.router.navigate([], { queryParams: { locationId }, queryParamsHandling: 'merge' });
    this.loadMobileUnits(locationId);
  }

  onInvalidSelection(_id: string): void {
    this.invalidId.set(true);
    this.locationId.set('');
    this.mobileUnits.set([]);
    this.router.navigate([], { queryParams: { locationId: null }, queryParamsHandling: 'merge' });
  }

  loadMobileUnits(locationId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.locationService.listMobileUnits().subscribe({
      next: (result) => {
        const payload = Array.isArray(result)
          ? result
          : (result as { items?: unknown[] })?.items ?? [];
        this.allUnits.set(payload);
        this.applyFilter(locationId);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('LOCATION.MOBILE_UNITS.ERROR.LOAD');
        this.loading.set(false);
      },
    });
  }

  private applyFilter(locationId: string): void {
    const filtered = this.allUnits().filter(u =>
      String((u as Record<string, unknown>)['baseLocationId'] ?? '') === locationId,
    );
    this.mobileUnits.set(filtered);
  }

  openCreate(): void {
    this.createName.set('');
    this.showCreateModal.set(true);
  }

  closeCreate(): void {
    this.showCreateModal.set(false);
  }

  submitCreate(): void {
    const name = this.createName().trim();
    if (!name) {
      this.error.set('LOCATION.MOBILE_UNITS.ERROR.NAME_REQUIRED');
      return;
    }

    this.locationService.createMobileUnit({ name }).subscribe({
      next: () => {
        this.closeCreate();
        this.loadMobileUnits(this.locationId());
      },
      error: () => this.error.set('LOCATION.MOBILE_UNITS.ERROR.CREATE'),
    });
  }

  openCoverage(unit: unknown): void {
    this.selectedUnit.set(unit);
    this.coverageRegion.set('');
    this.showCoverageModal.set(true);
  }

  closeCoverage(): void {
    this.showCoverageModal.set(false);
    this.selectedUnit.set(null);
  }

  submitCoverageRules(): void {
    const unit = this.selectedUnit() as Record<string, unknown> | null;
    const unitId = String(unit?.['mobileUnitId'] ?? unit?.['id'] ?? '');
    const coverage = this.coverageRegion().trim();

    if (!unitId) {
      this.error.set('LOCATION.MOBILE_UNITS.ERROR.SELECT_UNIT');
      return;
    }

    const body = coverage ? [{ region: coverage }] : [];
    this.locationService.replaceCoverageRules(unitId, body).subscribe({
      next: () => {
        this.closeCoverage();
        this.loadMobileUnits(this.locationId());
      },
      error: () => this.error.set('LOCATION.MOBILE_UNITS.ERROR.UPDATE_COVERAGE'),
    });
  }

  getUnitName(unit: unknown): string {
    const candidate = unit as Record<string, unknown>;
    return String(candidate['name'] ?? candidate['unitName'] ?? candidate['mobileUnitId'] ?? 'Mobile Unit');
  }
}
```

- [ ] **Step 4: Add the picker + prompt to the template**

At the top of `mobile-units-page.component.html`, inside the root container before the
existing content, insert:

```html
<app-location-picker
  label="Base location"
  [selectedId]="locationId()"
  (locationSelected)="onLocationSelected($event)"
  (invalidSelection)="onInvalidSelection($event)"
></app-location-picker>

@if (invalidId()) {
  <p class="field-error" role="alert">Location not found — select another.</p>
}

@if (!locationId()) {
  <p class="empty-state">Select a base location to view and edit its mobile units.</p>
}
```

Then guard the existing mobile-units content block with `@if (locationId()) { … }`,
leaving modal markup outside the guard.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx ng test --no-watch --filter "MobileUnitsPageComponent"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/location/pages/mobile-units/
git commit -m "feat(location): base-location picker + filter on mobile-units page"
```

---

## Task 5: Full verification

- [ ] **Step 1: Build the app**

Run: `npm run build -- --configuration alpha`
Expected: `Application bundle generation complete.` (no TS errors).

- [ ] **Step 2: Run all four suites isolated**

Run each and expect PASS:
```bash
npx ng test --no-watch --filter "LocationPickerComponent"
npx ng test --no-watch --filter "BaysPageComponent"
npx ng test --no-watch --filter "StorageLocationsPageComponent"
npx ng test --no-watch --filter "MobileUnitsPageComponent"
```

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "test(location): verify parent-location picker wiring" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Template guarding (Steps labelled "guard the existing content block"):** open each
  `.html`, read its current top-level structure, and wrap only the data/list section in
  `@if (locationId()) { … }`. Do not wrap `<app-location-picker>`, the invalid notice, or
  the prompt. Keep modal/dialog markup outside the guard so they still work.
- **`field-error` / `empty-state` classes:** reuse whatever the page/app already uses for
  errors and empty states; if absent, the classes in the picker CSS / page CSS are fine —
  check the sibling `locations-page.component.html` for the established class names and
  match them.
- **`getAllLocations()` shape:** returns rows typed `unknown[]`; the picker casts to its
  internal `PickerLocation`. Rows without an `id` are filtered out.
- **No SDK/openapi/backend changes** — confirm `git status` shows only frontend
  `src/app/features/location/**` and the docs files changed.
