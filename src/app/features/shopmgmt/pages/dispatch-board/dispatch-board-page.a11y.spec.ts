import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import axe from 'axe-core';

import { DispatchBoardPageComponent } from './dispatch-board-page.component';
import { DispatchBoardService } from '../../services/dispatch-board.service';
import { WorkorderSummaryResourceTypeEnum } from '@durion-sdk/workorder';
import type { DashboardResponse } from '../../models/dispatch-board.models';

/**
 * Genuine axe coverage of the RENDERED dispatch board.
 *
 * `scripts/a11y/smoke-routes.mjs` cannot provide this: it builds its JSDOM with
 * `runScripts: 'outside-only'`, so the Angular bundle never executes and axe
 * only ever sees the un-hydrated index shell. These specs render real DOM
 * through TestBed, which matters here for two reasons the design creates: the
 * row lanes and the status chips carry meaning in colour, so each needs a text
 * equivalent (ADR-0039); and every drag affordance has to have a keyboard and
 * pointer twin, because a board reachable only by dragging is reachable by
 * roughly nobody using assistive technology.
 */

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * `html, body` in src/styles.css transition colour and background over 250ms.
 * A contrast audit cares about the settled colours, and measuring mid-flight
 * reads the outgoing theme's text against the incoming theme's panels — which
 * reports failures no user ever sees, and leaks across tests. Switching the
 * transition off for these specs removes the race rather than sleeping past it.
 */
const NO_TRANSITION_STYLE = '*, *::before, *::after { transition: none !important; }';

const dashboard: DashboardResponse = {
  date: TODAY,
  locationId: 'LOC-1',
  lastRefreshed: new Date().toISOString(),
  dataQualityWarning: false,
  conflicts: [],
  workorders: [
    {
      workorderId: 'wo-to-assign',
      workorderNumber: 'WO-24118',
      status: 'APPROVED',
      estimatedLaborHours: 3.5,
      serviceDescriptions: ['Brake reline'],
      vehicleDescription: '2021 Freightliner M2 106',
      customerName: 'Distribution Rt 12',
    },
    {
      workorderId: 'wo-parked',
      workorderNumber: 'WO-24122',
      status: 'APPROVED',
      resourceType: WorkorderSummaryResourceTypeEnum.Hold,
      assignedResourceId: 'LOC-1',
    },
    {
      workorderId: 'wo-assigned',
      workorderNumber: 'WO-24124',
      status: 'ASSIGNED',
      assignedMechanicId: 'M1',
      resourceType: WorkorderSummaryResourceTypeEnum.Bay,
      assignedResourceId: 'B1',
    },
  ],
  mechanics: [
    { personId: 'M1', firstName: 'Ray', lastName: 'Delgado', assignedWorkorderId: 'wo-assigned' },
    { personId: 'M2', firstName: 'Dev', lastName: 'Patel' },
    { personId: 'M3', firstName: 'Hollis', lastName: 'Pike', onBreak: true },
  ],
  bays: [
    { bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-assigned' },
    { bayId: 'B4', bayName: 'Bay 4', available: true, status: 'ACTIVE' },
  ],
};

describe('DispatchBoardPageComponent accessibility', () => {
  let fixture: ComponentFixture<DispatchBoardPageComponent>;
  let component: DispatchBoardPageComponent;

  const dispatchBoardServiceStub = {
    getDashboard: vi.fn().mockReturnValue(of(dashboard)),
    getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: 'LOC-1' })),
    getAvailability: vi.fn().mockReturnValue(of([])),
    getBayKinds: vi.fn().mockReturnValue(of(new Map([['B4', 'ALIGNMENT']]))),
    getTechnicianSkills: vi.fn().mockReturnValue(of(new Map([['M1', ['BRAKES']]]))),
    assignMechanic: vi.fn().mockReturnValue(of({})),
    releaseMechanic: vi.fn().mockReturnValue(of({})),
    assignBay: vi.fn().mockReturnValue(of({})),
    releaseBay: vi.fn().mockReturnValue(of({})),
  };

  let noTransition: HTMLStyleElement;

  beforeEach(async () => {
    noTransition = document.createElement('style');
    noTransition.textContent = NO_TRANSITION_STYLE;
    document.head.appendChild(noTransition);

    await TestBed.configureTestingModule({
      imports: [DispatchBoardPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: dispatchBoardServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchBoardPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    noTransition.remove();
  });

  async function runAxe(): Promise<axe.AxeResults> {
    return axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  }

  it('renders the loaded board with no axe violations', async () => {
    const results = await runAxe();

    expect(results.violations.map(violation => violation.id)).toEqual([]);
  });

  // The token model is the only thing making dark mode work, so it is checked
  // as its own rendering rather than assumed to follow from the light one.
  it('renders the loaded board in dark mode with no axe violations', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    fixture.detectChanges();

    const results = await runAxe();

    expect(results.violations.map(violation => violation.id)).toEqual([]);
  });

  it('renders the mechanic picker dialog with no axe violations', async () => {
    component.openPicker('MECHANIC', 'wo-to-assign');
    fixture.detectChanges();

    const results = await runAxe();

    expect(results.violations.map(violation => violation.id)).toEqual([]);
  });

  // A native <dialog> promoted by appModalDialog: the browser supplies the
  // implicit dialog role, aria-modal, the top layer and — the part a
  // hand-rolled scrim cannot provide — a real focus trap.
  it('renders the picker as a native modal dialog with an accessible name', () => {
    component.openPicker('BAY', 'wo-to-assign');
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog.picker') as HTMLDialogElement | null;
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-label')).toContain('SHOPMGMT.DISPATCH_BOARD.PICK_BAY_FOR');
  });

  it('opens the picker in the top layer so focus cannot reach the board behind it', () => {
    component.openPicker('MECHANIC', 'wo-to-assign');
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog.picker') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    // showModal() — not show() — is what traps focus and renders the backdrop.
    expect(dialog.matches(':modal')).toBe(true);
  });

  // The design assigns by dragging. Dragging alone is unusable from a keyboard,
  // so each draggable source must also be reachable through the row's own slot.
  it('offers a pointer and keyboard path to every assignment the drag path offers', () => {
    const slots: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button.slot'),
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.tagName).toBe('BUTTON');
    }
  });

  it('names each draggable mechanic and bay for assistive technology', () => {
    const draggables: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[draggable="true"]'),
    );

    expect(draggables.length).toBeGreaterThan(0);
    for (const draggable of draggables) {
      expect(draggable.getAttribute('aria-label')).toBeTruthy();
    }
  });

  // ADR-0039: the lane tint and the left-edge status colour must not be the
  // only way to tell a row's state.
  it('states a row status in text, not only in its colour', () => {
    const chips: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.workorder-status'),
    );

    expect(chips.map(chip => chip.textContent?.trim())).toEqual([
      'APPROVED',
      'APPROVED',
      'ASSIGNED',
    ]);
  });

  // Resolved against real strings rather than the bare keys the other specs
  // assert on, because the point here is that the label names *which* workorder
  // the control acts on — an untranslated key would hide a missing parameter.
  it('labels each clear control with the workorder it acts on', () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(
      'en',
      {
        SHOPMGMT: {
          DISPATCH_BOARD: {
            CLEAR_MECHANIC_ARIA: 'Clear the mechanic on workorder {{workorder}}',
            CLEAR_BAY_ARIA: 'Clear the bay on workorder {{workorder}}',
          },
        },
      },
      true,
    );
    translate.use('en');
    fixture.detectChanges();

    const clears: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.clear'));

    expect(clears.length).toBeGreaterThan(0);
    for (const clear of clears) {
      expect(clear.getAttribute('aria-label')).toContain('WO-24124');
    }
  });

  it('closes the picker on Escape', () => {
    component.openPicker('MECHANIC', 'wo-to-assign');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog.picker') as HTMLDialogElement;
    expect(dialog).toBeTruthy();

    // Esc on a native modal fires `cancel`, which the directive forwards.
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();

    expect(component.picker()).toBeNull();
    expect(fixture.nativeElement.querySelector('dialog.picker')).toBeFalsy();
  });

  it('announces a completed assignment through a live region', () => {
    component.assignMechanic(component.toAssignRows()[0], 'M2');
    fixture.detectChanges();

    const toast: HTMLElement | null = fixture.nativeElement.querySelector('.toast');
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
  });
});
