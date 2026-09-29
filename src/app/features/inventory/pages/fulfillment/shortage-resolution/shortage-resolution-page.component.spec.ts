import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  ShortageOption,
  ShortageResolutionResult,
  WorkorderReservation,
} from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';
import { ShortageResolutionPageComponent } from './shortage-resolution-page.component';

const SHORT_LINE: WorkorderReservation = {
  reservationId: 'res-1',
  workorderLineId: 'line-1',
  sku: 'BRK-PAD-01',
  requiredQuantity: 4,
  allocatedQuantity: 1,
  shortQuantity: 3,
  status: 'PARTIALLY_FULFILLED',
  allocations: [
    { allocationId: 'alloc-1', locationId: 'loc-main', allocatedQuantity: 1, allocationState: 'SOFT', status: 'ALLOCATED' },
  ],
};

const FULL_LINE: WorkorderReservation = {
  ...SHORT_LINE,
  reservationId: 'res-2',
  workorderLineId: 'line-2',
  allocatedQuantity: 4,
  shortQuantity: 0,
  status: 'FULFILLED',
  allocations: [{ ...SHORT_LINE.allocations[0], allocationId: 'alloc-2' }],
};

const OPTIONS: ShortageOption[] = [
  { allocationId: 'alloc-1', optionType: 'BACKORDER', description: 'Backorder from supplier', expectedResolutionDate: '2026-10-06' },
  {
    allocationId: 'alloc-1',
    optionType: 'TRANSFER_IN',
    description: 'Transfer from North',
    availableQuantity: 5,
    sourceLocationId: 'loc-north',
  },
];

const RESULT: ShortageResolutionResult = {
  allocationId: 'alloc-1',
  optionType: 'TRANSFER_IN',
  artifactType: 'TRANSFER_ORDER',
  artifactId: 'to-1',
  idempotencyKey: 'alloc-1:TRANSFER_IN',
  status: 'COMPLETED',
  resolvedAt: '2026-09-29T12:00:00Z',
};

const RESOLVE = 'inventory:shortage:resolve';

const authStub = {
  known: true,
  granted: ['inventory:shortage:view', RESOLVE] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const httpError = (status: number): HttpErrorResponse => new HttpErrorResponse({ status });

describe('ShortageResolutionPageComponent', () => {
  let fixture: ComponentFixture<ShortageResolutionPageComponent>;
  let component: ShortageResolutionPageComponent;
  let el: HTMLElement;

  const inventoryStub = {
    getWorkorderReservations: vi.fn(),
    getShortageOptions: vi.fn(),
    resolveShortage: vi.fn(),
    getLocations: vi.fn(),
  };

  const setup = (params: Record<string, string> = { workorderId: 'wo-1' }, query: Record<string, string> = {}): void => {
    TestBed.configureTestingModule({
      imports: [ShortageResolutionPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: inventoryStub },
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap(params)).asObservable(),
            snapshot: { queryParamMap: convertToParamMap(query) },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ShortageResolutionPageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const all = (testId: string): HTMLElement[] => Array.from(el.querySelectorAll(`[data-testid="${testId}"]`));
  const pick = (testId: string, index = 0): void => {
    const radio = all(testId)[index].querySelector('input') ?? (all(testId)[index] as HTMLInputElement);
    radio.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    inventoryStub.getWorkorderReservations.mockReturnValue(of([SHORT_LINE, FULL_LINE]));
    inventoryStub.getShortageOptions.mockReturnValue(of(OPTIONS));
    inventoryStub.getLocations.mockReturnValue(
      of([
        { locationId: 'loc-main', name: 'Main Street', status: 'ACTIVE' },
        { locationId: 'loc-north', name: 'North Side', status: 'ACTIVE' },
      ]),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    authStub.known = true;
    authStub.granted = ['inventory:shortage:view', RESOLVE];
    TestBed.resetTestingModule();
  });

  it("lists only the workorder's short lines, with their allocations by location name", () => {
    setup();

    expect(inventoryStub.getWorkorderReservations).toHaveBeenCalledWith('wo-1');
    expect(all('shortage-line').map(line => line.getAttribute('data-reservation'))).toEqual(['res-1']);
    expect(query('shortage-line')?.textContent).toContain('BRK-PAD-01');
    expect(query('shortage-line')?.textContent).not.toContain('loc-main');
    expect(all('shortage-allocation')).toHaveLength(1);
  });

  it('says so when no line is short', () => {
    inventoryStub.getWorkorderReservations.mockReturnValue(of([FULL_LINE]));
    setup();

    expect(query('shortage-empty')).not.toBeNull();
  });

  it('explains a short line with no allocation in reach', () => {
    inventoryStub.getWorkorderReservations.mockReturnValue(of([{ ...SHORT_LINE, allocations: [] }]));
    setup();

    expect(query('shortage-no-allocation')).not.toBeNull();
  });

  it.each([
    [403, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.FORBIDDEN'],
    [500, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.LOAD_RESERVATIONS'],
  ])('classifies a %s reading the reservations, state before key', (status, key) => {
    inventoryStub.getWorkorderReservations.mockReturnValue(throwError(() => httpError(status)));
    setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe(key);
  });

  it('reads the options for the chosen allocation, letting the server derive sku and quantity', () => {
    setup();

    pick('shortage-allocation');

    expect(inventoryStub.getShortageOptions).toHaveBeenCalledWith('alloc-1', undefined, undefined, 'line-1', 'loc-main');
    expect(all('shortage-option')).toHaveLength(2);
    expect(component.locationName(OPTIONS[1].sourceLocationId)).toBe('North Side');
  });

  it('drops options read for an allocation the user has moved on from (ADR-0063)', () => {
    const second: WorkorderReservation = {
      ...SHORT_LINE,
      reservationId: 'res-3',
      workorderLineId: 'line-3',
      allocations: [{ ...SHORT_LINE.allocations[0], allocationId: 'alloc-3' }],
    };
    inventoryStub.getWorkorderReservations.mockReturnValue(of([SHORT_LINE, second]));
    const first = new Subject<ShortageOption[]>();
    const latest = new Subject<ShortageOption[]>();
    inventoryStub.getShortageOptions.mockReturnValueOnce(first).mockReturnValueOnce(latest);
    setup();

    pick('shortage-allocation', 0);
    pick('shortage-allocation', 1);
    latest.next([{ ...OPTIONS[0], allocationId: 'alloc-3' }]);
    first.next(OPTIONS);

    expect(component.options().map(option => option.allocationId)).toEqual(['alloc-3']);
  });

  it('resolves the chosen option with its fields, then re-reads the lines and announces the outcome', () => {
    setup();
    inventoryStub.resolveShortage.mockReturnValue(of(RESULT));

    pick('shortage-allocation');
    pick('shortage-option', 1);
    component.notes.set('  Customer waiting  ');
    fixture.detectChanges();
    (query('shortage-confirm') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(inventoryStub.resolveShortage).toHaveBeenCalledWith({
      allocationId: 'alloc-1',
      optionType: 'TRANSFER_IN',
      workorderLineId: 'line-1',
      locationId: 'loc-main',
      sourceLocationId: 'loc-north',
      substituteSku: undefined,
      notes: 'Customer waiting',
    });
    expect(inventoryStub.getWorkorderReservations).toHaveBeenCalledTimes(2);
    expect(query('shortage-result')?.textContent).toContain('OPTION.TRANSFER_IN');
    expect(component.selected()).toBeNull();
  });

  it('preselects the allocation named by ?allocationId=', () => {
    setup({ workorderId: 'wo-1' }, { allocationId: 'alloc-1' });

    expect(component.selected()?.allocation.allocationId).toBe('alloc-1');
    expect(inventoryStub.getShortageOptions).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.ALLOCATION_NOT_FOUND'],
    [422, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.NOT_RESOLVABLE'],
    [403, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.FORBIDDEN_RESOLVE'],
    [500, 'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.SUBMIT'],
  ])('classifies a %s resolving, keeping the choice on screen', (status, key) => {
    setup();
    inventoryStub.resolveShortage.mockReturnValue(throwError(() => httpError(status)));

    pick('shortage-allocation');
    pick('shortage-option', 0);
    component.resolve();
    fixture.detectChanges();

    expect(query('shortage-resolve-error')?.textContent?.trim()).toBe(key);
    expect(component.selected()).not.toBeNull();
    expect(component.resolving()).toBe(false);
  });

  it('refuses resolving without inventory:shortage:resolve, in the control and the handler', () => {
    authStub.granted = ['inventory:shortage:view'];
    setup();

    pick('shortage-allocation');
    pick('shortage-option', 0);

    expect((query('shortage-confirm') as HTMLButtonElement).disabled).toBe(true);
    component.resolve();
    expect(inventoryStub.resolveShortage).not.toHaveBeenCalled();
  });

  it('shows location names as not available when the locations cannot be read, never the ids', () => {
    inventoryStub.getLocations.mockReturnValue(throwError(() => httpError(500)));
    setup();

    expect(component.locationName('loc-main')).toBeNull();
    expect(query('shortage-line')?.textContent).not.toContain('loc-main');
  });

  it('reports a missing workorder id without calling the backend', () => {
    setup({});

    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.MISSING_ID');
    expect(inventoryStub.getWorkorderReservations).not.toHaveBeenCalled();
  });
});
