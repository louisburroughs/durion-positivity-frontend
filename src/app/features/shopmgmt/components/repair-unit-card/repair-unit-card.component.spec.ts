import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { RepairUnitCardComponent } from './repair-unit-card.component';
import {
  DashboardWorkSynopsis,
  RepairUnitCard,
  StatusBand,
  formatHours,
} from '../../models/shop-dashboard.models';
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

  describe('synopsis', () => {
    function withSynopsis(synopsis: DashboardWorkSynopsis): RepairUnitCard {
      const unit = occupied('WORK_IN_PROGRESS');
      return { ...unit, workorder: { ...unit.workorder!, synopsis } };
    }

    const FULL: DashboardWorkSynopsis = {
      customerName: 'Carolina Concrete',
      serviceCount: 2,
      completedServiceCount: 1,
      serviceDescriptions: ['Brake Pad Replacement - Front', 'Oil Change'],
      estimatedLaborHours: 2.5,
      actualLaborHours: 1.5,
    };

    it('renders customer, lead service, remaining count, progress and labor at the foot of the card', () => {
      const el = render(withSynopsis(FULL));
      const footer = el.querySelector('footer.card-synopsis');

      expect(footer).not.toBeNull();
      expect(footer?.querySelector('.synopsis-customer')?.textContent).toContain('Carolina Concrete');
      expect(footer?.querySelector('.synopsis-lead')?.textContent).toContain('Brake Pad Replacement - Front');
      expect(footer?.querySelector('.synopsis-more')).not.toBeNull();
      expect(footer?.querySelector('.synopsis-progress')?.textContent).toContain('SERVICES_DONE');
      expect(footer?.querySelectorAll('.synopsis-labor')).toHaveLength(1);
      expect(footer?.querySelector('.synopsis-labor')?.textContent).toContain('LABOR_PROGRESS');
    });

    it('omits the remaining count when the lead service is the only line', () => {
      const el = render(withSynopsis({ ...FULL, serviceCount: 1, completedServiceCount: 0 }));

      expect(el.querySelector('.synopsis-lead')).not.toBeNull();
      expect(el.querySelector('.synopsis-more')).toBeNull();
    });

    it('shows the estimate alone when no hours are logged', () => {
      const el = render(withSynopsis({ ...FULL, actualLaborHours: undefined }));

      expect(el.querySelector('.synopsis-labor')?.textContent).toContain('LABOR_ESTIMATE');
    });

    it('shows logged hours alone when there is no estimate', () => {
      const el = render(withSynopsis({ ...FULL, estimatedLaborHours: undefined }));

      expect(el.querySelector('.synopsis-labor')?.textContent).toContain('LABOR_ACTUAL');
    });

    it('renders a customer-only synopsis without service or labor lines', () => {
      const el = render(
        withSynopsis({ customerName: 'Albert Rogers', serviceCount: 0, completedServiceCount: 0, serviceDescriptions: [] }),
      );

      expect(el.querySelector('.synopsis-customer')?.textContent).toContain('Albert Rogers');
      expect(el.querySelector('.synopsis-services')).toBeNull();
      expect(el.querySelector('.synopsis-progress')).toBeNull();
      expect(el.querySelector('.synopsis-labor')).toBeNull();
    });

    it('renders no footer when the workorder carries no synopsis', () => {
      const el = render(occupied('WORK_IN_PROGRESS'));

      expect(el.querySelector('footer.card-synopsis')).toBeNull();
    });

    it('renders no footer on an idle unit', () => {
      const el = render(IDLE_BAY);

      expect(el.querySelector('footer.card-synopsis')).toBeNull();
    });
  });

  describe('formatHours', () => {
    it.each([
      [2.5, '2.5'],
      [3, '3'],
      [1.25, '1.3'],
      [0.04, '0'],
    ])('formats %s as %s', (hours, expected) => {
      expect(formatHours(hours)).toBe(expected);
    });

    it('returns an empty string for an absent or non-finite value', () => {
      expect(formatHours(undefined)).toBe('');
      expect(formatHours(null)).toBe('');
      expect(formatHours(Number.NaN)).toBe('');
    });
  });
});
