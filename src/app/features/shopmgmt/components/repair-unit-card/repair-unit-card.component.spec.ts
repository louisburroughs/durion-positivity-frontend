import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { RepairUnitCardComponent } from './repair-unit-card.component';
import { RepairUnitCard, StatusBand } from '../../models/shop-dashboard.models';
import type { WorkorderStatus } from '../../../workexec/models/workexec.models';

const IDLE_BAY: RepairUnitCard = {
  unitId: 'bay-3',
  unitType: 'BAY',
  unitName: 'Bay 3',
  unitSubtitle: 'Heavy Duty',
  unitStatus: 'ACTIVE',
};

function occupied(status: WorkorderStatus, overrides: Partial<RepairUnitCard> = {}): RepairUnitCard {
  return {
    unitId: 'bay-1',
    unitType: 'BAY',
    unitName: 'Bay 1',
    unitSubtitle: 'Alignment',
    unitStatus: 'ACTIVE',
    workorder: {
      workorderId: 'wo-1',
      workorderNumber: 'WO-10428',
      status,
      vehicle: {
        vehicleId: 'veh-1',
        vin: '1FTFW1E85MFA88823',
        year: 2021,
        make: 'Ford',
        model: 'F-150',
      },
      mechanic: { personId: 'p-1', displayName: 'M. Alvarez' },
    },
    ...overrides,
  };
}

describe('RepairUnitCardComponent', () => {
  let fixture: ComponentFixture<RepairUnitCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RepairUnitCardComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RepairUnitCardComponent);
  });

  function render(unit: RepairUnitCard): HTMLElement {
    fixture.componentRef.setInput('unit', unit);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders workorder, vehicle and mechanic for an occupied unit', () => {
    const el = render(occupied('WORK_IN_PROGRESS'));

    expect(el.textContent).toContain('WO-10428');
    expect(el.textContent).toContain('2021 Ford F-150');
    expect(el.textContent).toContain('M. Alvarez');
  });

  it('labels the card by its own header so the unit name is the accessible name', () => {
    const el = render(occupied('WORK_IN_PROGRESS'));
    const article = el.querySelector('article');
    const labelledBy = article?.getAttribute('aria-labelledby');

    expect(labelledBy).toBeTruthy();
    expect(el.querySelector(`#${labelledBy}`)?.textContent).toContain('Bay 1');
  });

  // ADR-0039: every band pairs its colour with text, never colour alone.
  const bands: ReadonlyArray<[WorkorderStatus, StatusBand]> = [
    ['DRAFT', 'queued'],
    ['APPROVED', 'queued'],
    ['ASSIGNED', 'queued'],
    ['WORK_IN_PROGRESS', 'active'],
    ['AWAITING_PARTS', 'blocked'],
    ['AWAITING_APPROVAL', 'blocked'],
    ['READY_FOR_PICKUP', 'ready'],
    ['COMPLETED', 'closed'],
    ['CANCELLED', 'cancelled'],
  ];

  it.each(bands)('maps %s to the %s band with status text present', (status, band) => {
    const el = render(occupied(status));
    const header = el.querySelector('.card-header');

    expect(header?.classList.contains(`band-${band}`)).toBe(true);
    expect(header?.querySelector('.status-text')?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders an idle unit with the placeholder and no workorder rows', () => {
    const el = render(IDLE_BAY);

    expect(el.querySelector('.card-header')?.classList.contains('band-idle')).toBe(true);
    expect(el.querySelector('.idle-body')).not.toBeNull();
    expect(el.querySelector('.workorder-link')).toBeNull();
    expect(el.querySelector('.vin-value')).toBeNull();
  });

  it('falls back to the queued band and shows the raw value for an unknown status', () => {
    const el = render(occupied('SOMETHING_NEW' as WorkorderStatus));

    expect(el.querySelector('.card-header')?.classList.contains('band-queued')).toBe(true);
    expect(el.textContent).toContain('SOMETHING_NEW');
  });

  it('shows the unavailable message when no vehicle detail is known', () => {
    const unit = occupied('ASSIGNED');
    const el = render({ ...unit, workorder: { ...unit.workorder!, vehicle: undefined } });

    expect(el.querySelector('.vehicle-name')).toBeNull();
    expect(el.querySelector('.field-muted')).not.toBeNull();
  });

  it('uses the unstructured description when year, make and model are absent', () => {
    const unit = occupied('ASSIGNED');
    const el = render({
      ...unit,
      workorder: {
        ...unit.workorder!,
        vehicle: { vehicleId: '', description: '2019 Toyota Camry' },
      },
    });

    expect(el.textContent).toContain('2019 Toyota Camry');
  });

  it('marks the mechanic as unassigned when none is on the workorder', () => {
    const unit = occupied('ASSIGNED');
    const el = render({ ...unit, workorder: { ...unit.workorder!, mechanic: undefined } });

    expect(el.querySelector('.mechanic-name')).toBeNull();
  });

  it('keeps the full 17-character VIN in the DOM', () => {
    const el = render(occupied('WORK_IN_PROGRESS'));

    expect(el.querySelector('.vin-value')?.textContent?.trim()).toBe('1FTFW1E85MFA88823');
  });

  it('links the workorder into workexec rather than reloading the page', () => {
    const el = render(occupied('WORK_IN_PROGRESS'));
    const link = el.querySelector('.workorder-link');

    expect(link?.getAttribute('href')).toBe('/app/workexec/workorders/wo-1');
  });
});
