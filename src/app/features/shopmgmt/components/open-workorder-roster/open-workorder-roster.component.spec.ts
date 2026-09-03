import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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

/** Mirrors the shipped en-US subtree for the keys this component renders. */
const EN_US = {
  SHOPMGMT: {
    SHOP_DASHBOARD: {
      CARD: { VEHICLE_UNKNOWN: 'Vehicle details unavailable', OPEN_WORKORDER_ARIA: 'Open workorder {{number}}' },
      STATUS: {
        DRAFT: 'Draft', APPROVED: 'Approved', ASSIGNED: 'Assigned',
        WORK_IN_PROGRESS: 'Work in progress', AWAITING_PARTS: 'Awaiting parts',
        AWAITING_APPROVAL: 'Awaiting approval', READY_FOR_PICKUP: 'Ready for pickup',
      },
      ROSTER: {
        TITLE: 'Vehicles with open workorders', CAPTION: 'Vehicles with open workorders ({{count}})',
        COL: { VEHICLE: 'Vehicle', VIN: 'VIN', WORKORDER: 'Workorder', STATUS: 'Status', UNIT: 'Unit' },
        NO_UNIT: 'Not assigned to a unit', UNKNOWN_UNIT: 'Unknown unit',
        EMPTY: 'No open workorders at this location.',
        TRUNCATED: 'Showing the first {{count}} open workorders.',
      },
    },
  },
};

describe('OpenWorkorderRosterComponent', () => {
  let fixture: ComponentFixture<OpenWorkorderRosterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenWorkorderRosterComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    // Real strings, so the assertions below test rendered copy rather than
    // echoed translation keys.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', EN_US);
    translate.use('en-US');

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

  it('marks a row with no unit and exposes the label as real text, not aria-label on a span', () => {
    const el = render([UNASSIGNED]);
    const row = el.querySelector('tbody tr');

    expect(row?.classList.contains('row-unassigned')).toBe(true);
    // aria-label on a generic <span> is not reliably exposed; visually-hidden text is.
    // Scope to the Unit cell: the status chip also carries an aria-hidden glyph.
    const unitCell = row?.querySelectorAll('td')[3];
    expect(unitCell?.querySelector('.visually-hidden')?.textContent?.trim()).toBe('Not assigned to a unit');
    expect(unitCell?.querySelector('[aria-hidden="true"]')?.textContent).toContain('\u2014');
  });

  it('never prints a raw unit id when the unit name could not be resolved', () => {
    const el = render([{ ...UNASSIGNED, unitId: 'bay-uuid-1234', unitName: undefined }]);
    const unitCell = el.querySelectorAll('tbody td')[3];

    expect(unitCell?.textContent).not.toContain('bay-uuid-1234');
    expect(unitCell?.textContent?.trim()).toBe('Unknown unit');
  });

  // Each status must map to ITS band and render ITS translated text. The
  // previous version accepted any of four bands for any status, so it passed
  // even if statusBand() returned a constant.
  const openStatuses: ReadonlyArray<[WorkorderStatus, string, string]> = [
    ['DRAFT', 'queued', 'Draft'],
    ['APPROVED', 'queued', 'Approved'],
    ['ASSIGNED', 'queued', 'Assigned'],
    ['WORK_IN_PROGRESS', 'active', 'Work in progress'],
    ['AWAITING_PARTS', 'blocked', 'Awaiting parts'],
    ['AWAITING_APPROVAL', 'blocked', 'Awaiting approval'],
    ['READY_FOR_PICKUP', 'ready', 'Ready for pickup'],
  ];

  it.each(openStatuses)('renders %s in the %s band with the text "%s"', (status, band, text) => {
    const el = render([{ ...UNASSIGNED, status }]);
    const chip = el.querySelector('.status-chip');

    expect(chip?.classList.contains(`band-${band}`)).toBe(true);
    expect(chip?.textContent?.trim()).toContain(text);
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
