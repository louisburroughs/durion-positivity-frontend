import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { OpenWorkorderRosterComponent } from './open-workorder-roster.component';
import { OpenWorkorderRow } from '../../models/shop-dashboard.models';
import type { WorkorderStatus } from '../../../workexec/models/workexec.models';

const ON_BAY: OpenWorkorderRow = {
  workorderId: 'wo-1',
  workorderNumber: 'WO-10428',
  status: 'WORK_IN_PROGRESS',
  vehicle: { vehicleId: 'veh-1', vin: '1FTFW1E85MFA88823', year: 2021, make: 'Ford', model: 'F-150' },
  mechanic: { personId: 'p-1', displayName: 'M. Alvarez' },
  unitId: 'bay-1',
  unitName: 'Bay 1',
};

const UNASSIGNED: OpenWorkorderRow = {
  workorderId: 'wo-2',
  workorderNumber: 'WO-10433',
  status: 'ASSIGNED',
  vehicle: { vehicleId: 'veh-2', vin: '2HGFC2F59JH512260', year: 2018, make: 'Honda', model: 'Civic' },
};

describe('OpenWorkorderRosterComponent', () => {
  let fixture: ComponentFixture<OpenWorkorderRosterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenWorkorderRosterComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(OpenWorkorderRosterComponent);
  });

  function render(rows: OpenWorkorderRow[], truncated = false): HTMLElement {
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('truncated', truncated);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders one row per workorder in the order supplied', () => {
    const el = render([UNASSIGNED, ON_BAY]);
    const rows = el.querySelectorAll('tbody tr');

    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('WO-10433');
    expect(rows[1].textContent).toContain('WO-10428');
  });

  it('shows the unit name for a row that is on a repair unit', () => {
    const el = render([ON_BAY]);

    expect(el.querySelector('tbody tr')?.textContent).toContain('Bay 1');
  });

  it('marks a row with no unit and gives the dash an accessible label', () => {
    const el = render([UNASSIGNED]);
    const row = el.querySelector('tbody tr');

    expect(row?.classList.contains('row-unassigned')).toBe(true);
    expect(row?.querySelector('.cell-muted[aria-label]')).not.toBeNull();
  });

  const openStatuses: WorkorderStatus[] = [
    'DRAFT',
    'APPROVED',
    'ASSIGNED',
    'WORK_IN_PROGRESS',
    'AWAITING_PARTS',
    'AWAITING_APPROVAL',
    'READY_FOR_PICKUP',
  ];

  it.each(openStatuses)('renders a banded chip with text for %s', status => {
    const el = render([{ ...UNASSIGNED, status }]);
    const chip = el.querySelector('.status-chip');

    expect(chip?.className).toMatch(/band-(queued|active|blocked|ready)/);
    expect(chip?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders the empty message rather than omitting the section', () => {
    const el = render([]);

    expect(el.querySelector('.roster-empty')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('h2')).not.toBeNull();
  });

  it('shows the truncation notice only when the list is capped', () => {
    expect(render([ON_BAY], false).querySelector('.roster-truncated')).toBeNull();
    expect(render([ON_BAY], true).querySelector('.roster-truncated')).not.toBeNull();
  });

  it('keeps the full VIN in the DOM', () => {
    const el = render([ON_BAY]);

    expect(el.querySelector('.vin-value')?.textContent?.trim()).toBe('1FTFW1E85MFA88823');
  });

  it('exposes table semantics: caption, column headers and a row header', () => {
    const el = render([ON_BAY]);

    expect(el.querySelector('caption')).not.toBeNull();
    expect(el.querySelectorAll('thead th[scope="col"]')).toHaveLength(5);
    expect(el.querySelector('tbody th[scope="row"]')).not.toBeNull();
  });

  it('falls back to the unavailable copy when a row has no vehicle', () => {
    const el = render([{ ...UNASSIGNED, vehicle: undefined }]);

    expect(el.querySelector('tbody th .cell-muted')).not.toBeNull();
  });
});
