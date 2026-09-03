import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach } from 'vitest';
import axe from 'axe-core';
import { OpenWorkorderRosterComponent } from './open-workorder-roster.component';
import { RepairUnitCardComponent } from '../repair-unit-card/repair-unit-card.component';
import { OpenWorkorderRow, RepairUnitCard } from '../../models/shop-dashboard.models';

/**
 * Genuine axe coverage of the RENDERED components.
 *
 * `scripts/a11y/smoke-routes.mjs` cannot provide this: it builds its JSDOM with
 * `runScripts: 'outside-only'`, so the Angular bundle never executes and axe only
 * ever sees the un-hydrated index shell. That is why every route in that suite
 * reports an identical 5 passes / 58 inapplicable. These specs render real DOM
 * through TestBed, so they actually exercise the card grid and the roster table.
 */
const ROWS: OpenWorkorderRow[] = [
  {
    workorderId: 'wo-1',
    workorderNumber: 'WO-10428',
    status: 'WORK_IN_PROGRESS',
    vehicle: { vehicleId: 'v1', vin: '1FTFW1E85MFA88823', year: 2021, make: 'Ford', model: 'F-150' },
    mechanic: { personId: 'p1', displayName: 'M. Alvarez' },
    unitId: 'bay-1',
    unitName: 'Bay 1',
  },
  {
    workorderId: 'wo-2',
    workorderNumber: 'WO-10433',
    status: 'AWAITING_PARTS',
    vehicle: { vehicleId: 'v2', vin: '2HGFC2F59JH512260', year: 2018, make: 'Honda', model: 'Civic' },
  },
];

const OCCUPIED: RepairUnitCard = {
  unitId: 'bay-1',
  unitType: 'BAY',
  unitName: 'Bay 1',
  unitSubtitle: 'Alignment',
  workorder: {
    workorderId: 'wo-1',
    workorderNumber: 'WO-10428',
    status: 'WORK_IN_PROGRESS',
    vehicle: { vehicleId: 'v1', vin: '1FTFW1E85MFA88823', year: 2021, make: 'Ford', model: 'F-150' },
    mechanic: { personId: 'p1', displayName: 'M. Alvarez' },
  },
};

const IDLE: RepairUnitCard = { unitId: 'bay-3', unitType: 'BAY', unitName: 'Bay 3' };

async function violations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations;
}

describe('Shop dashboard a11y (rendered DOM)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenWorkorderRosterComponent, RepairUnitCardComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('roster with rows has no axe violations', async () => {
    const fixture: ComponentFixture<OpenWorkorderRosterComponent> =
      TestBed.createComponent(OpenWorkorderRosterComponent);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('truncated', false);
    fixture.detectChanges();

    expect(await violations(fixture.nativeElement as HTMLElement)).toEqual([]);
  });

  it('roster keeps table semantics: rows expose the row role and headers stay associated', async () => {
    const fixture: ComponentFixture<OpenWorkorderRosterComponent> =
      TestBed.createComponent(OpenWorkorderRosterComponent);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // Guards the regression where `display: grid` on <tr> dropped role="row"
    // and severed the scope="col"/scope="row" associations at narrow widths.
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    for (const row of Array.from(rows)) {
      expect(row.querySelector('th[scope="row"]')).not.toBeNull();
    }
    expect(el.querySelectorAll('thead th[scope="col"]')).toHaveLength(5);
    expect(el.querySelector('caption')).not.toBeNull();
  });

  it('occupied repair unit card has no axe violations', async () => {
    const fixture: ComponentFixture<RepairUnitCardComponent> =
      TestBed.createComponent(RepairUnitCardComponent);
    fixture.componentRef.setInput('unit', OCCUPIED);
    fixture.detectChanges();

    expect(await violations(fixture.nativeElement as HTMLElement)).toEqual([]);
  });

  it('idle repair unit card has no axe violations', async () => {
    const fixture: ComponentFixture<RepairUnitCardComponent> =
      TestBed.createComponent(RepairUnitCardComponent);
    fixture.componentRef.setInput('unit', IDLE);
    fixture.detectChanges();

    expect(await violations(fixture.nativeElement as HTMLElement)).toEqual([]);
  });
});
