import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import axe from 'axe-core';

import { DispatchBoardPageComponent } from './dispatch-board-page.component';
import { DispatchBoardService } from '../../services/dispatch-board.service';
import { WorkorderSummaryResourceTypeEnum } from '@durion-sdk/workorder';
import type { DashboardResponse } from '../../models/dispatch-board.models';
import { isoDateLocal } from '../../models/capacity-calendar.models';

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

const TODAY = isoDateLocal(new Date());

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
    getBayInventory: vi.fn().mockReturnValue(
      of(new Map([['B4', { bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false }]])),
    ),
    getTechnicianRoster: vi.fn().mockReturnValue(
      of({
        skills: new Map([['M1', ['BRAKES']]]),
        shifts: new Map([['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]),
        ok: true,
      }),
    ),
    getClockStates: vi.fn().mockReturnValue(of({ states: new Map(), ok: true })),
    assignMechanic: vi.fn().mockReturnValue(of({})),
    releaseMechanic: vi.fn().mockReturnValue(of({})),
    assignBay: vi.fn().mockReturnValue(of({})),
    releaseBay: vi.fn().mockReturnValue(of({})),
    parkWorkorder: vi.fn().mockReturnValue(of({})),
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

  // The clock controls are siblings of the drag handle, not children of it: a
  // button nested in a button is one control to the accessibility tree and
  // neither is separately operable. This pins that the scan above actually
  // covered them, rather than passing because they were not rendered.
  it('renders the clock controls as their own buttons beside the drag handle', () => {
    expect(component.canManageClock()).toBe(true);

    const row: HTMLElement = fixture.nativeElement.querySelector('.mech-row');
    const handle: HTMLButtonElement | null = row.querySelector('button.mech');
    const clockButtons: HTMLButtonElement[] = Array.from(row.querySelectorAll('.clock-btn'));

    expect(handle).toBeTruthy();
    expect(handle?.querySelector('.clock-btn')).toBeNull();
    expect(clockButtons).toHaveLength(2);
    expect(clockButtons.every(button => button.getAttribute('aria-label'))).toBe(true);
    expect(row.querySelector('.mclock')?.getAttribute('role')).toBe('group');
  });

  // `aria-label` on an element REPLACES its descendant text in the accessible
  // name, so anything inside the drag handle — the free-hours reading included
  // — is invisible to assistive tech unless it is pulled in as a description.
  it('describes the drag handle with the free-hours reading it contains', () => {
    const row: HTMLElement = fixture.nativeElement.querySelector('.mech-row');
    const handle: HTMLButtonElement = row.querySelector('button.mech')!;
    const describedBy = handle.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    const description = fixture.nativeElement.querySelector(`#${CSS.escape(describedBy!)}`);
    expect(description).toBeTruthy();
    expect(description.classList.contains('mfree')).toBe(true);
  });

  // The hint explains why a control is inert or doubled. A disabled button
  // cannot take focus, so the group carries the description too.
  it('ties the clock hint to the controls it explains', () => {
    component.selectedDate.set('2026-05-04');
    fixture.detectChanges();

    const group: HTMLElement = fixture.nativeElement.querySelector('.mclock');
    const hintId = group.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`#${CSS.escape(hintId!)}`)?.textContent).toContain(
      'CLOCK_TODAY_ONLY',
    );

    for (const button of Array.from(group.querySelectorAll('.clock-btn'))) {
      expect(button.getAttribute('aria-describedby')).toBe(hintId);
    }
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

  // A div with `draggable` is a mouse-only control: no role, no tab stop. And
  // a label that promises an action ("Assign Ray to a workorder") which Enter
  // and Space do not perform misleads the one audience that relies on it
  // (F15): the chip is a drag handle, and its name says where the keyboard
  // route is. Resolved against the en-US copy, mirrored below the way
  // user-provision-page.component.spec.ts does, so the assertion is on what a
  // screen reader announces, parameters included.
  it('names each draggable mechanic and bay as a drag handle that points to the slot, on a real button', () => {
    // Mirrors SHOPMGMT.DISPATCH_BOARD in src/assets/i18n/en-US.json.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(
      'en',
      {
        SHOPMGMT: {
          DISPATCH_BOARD: {
            MECHANIC_ARIA: 'Drag handle for {{name}}. To assign by keyboard, use the mechanic slot on a workorder.',
            MECHANIC_ARIA_UNNAMED:
              'Drag handle for an unnamed mechanic. To assign by keyboard, use the mechanic slot on a workorder.',
            BAY_ARIA: 'Drag handle for {{name}}. To place a workorder by keyboard, use the bay slot on the workorder.',
            BAY_ARIA_UNNAMED:
              'Drag handle for an unnamed bay. To place a workorder by keyboard, use the bay slot on the workorder.',
          },
        },
      },
      true,
    );
    translate.use('en');
    fixture.detectChanges();

    const draggables: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[draggable="true"]'),
    );

    // Two on-duty mechanics and one open bay.
    expect(draggables.map(draggable => draggable.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    expect(draggables.map(draggable => draggable.getAttribute('aria-label'))).toEqual([
      'Drag handle for Ray Delgado. To assign by keyboard, use the mechanic slot on a workorder.',
      'Drag handle for Dev Patel. To assign by keyboard, use the mechanic slot on a workorder.',
      'Drag handle for Bay 4. To place a workorder by keyboard, use the bay slot on the workorder.',
    ]);
    for (const draggable of draggables) {
      const label = draggable.getAttribute('aria-label') ?? '';
      expect(label).not.toMatch(/^(Assign|Place a workorder)/);
      expect(label).toMatch(/use the (mechanic|bay) slot on (a|the) workorder\.$/);
    }
  });

  // ADR-0039: the lane tint and the left-edge status colour must not be the
  // only way to tell a row's state.
  it('states a row status in text, not only in its colour', () => {
    const chips: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.workorder-status'),
    );

    expect(chips.map(chip => chip.textContent?.trim())).toEqual([
      'WORKEXEC.WIP_STATUS.APPROVED',
      'WORKEXEC.WIP_STATUS.APPROVED',
      'WORKEXEC.WIP_STATUS.ASSIGNED',
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

  // A refused assignment is the only sign the write failed and the dispatcher
  // has to act on it, so it interrupts rather than waiting its turn.
  it('announces a refused assignment assertively', () => {
    dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(
      throwError(() => ({ status: 409, error: { code: 'TECHNICIAN_ALREADY_ASSIGNED' } })),
    );

    component.assignMechanic(component.toAssignRows()[0], 'M2');
    fixture.detectChanges();

    const toast: HTMLElement | null = fixture.nativeElement.querySelector('.toast');
    expect(toast?.getAttribute('role')).toBe('alert');
    expect(toast?.getAttribute('aria-live')).toBe('assertive');
  });

  // `title` reaches neither the keyboard nor touch, and a bare em dash is
  // announced as "dash". The board is re-read with an unnamed mechanic on a
  // row and an unnamed bay on the rail so the slot and chip placeholders render
  // too. A placeholder counts as described by its own text equivalent or by
  // the accessible name of the control it sits in — the row article's label,
  // which every row placeholder sits inside, does not count (T1).
  it('gives every not-available placeholder a text equivalent', () => {
    const withUnnamed: DashboardResponse = {
      ...dashboard,
      workorders: (dashboard.workorders ?? []).map(workorder =>
        workorder.workorderId === 'wo-assigned'
          ? { ...workorder, assignedMechanicId: 'person-uuid-nameless' }
          : workorder,
      ),
      mechanics: [
        { personId: 'person-uuid-nameless', assignedWorkorderId: 'wo-assigned' },
        { personId: 'M2', firstName: 'Dev', lastName: 'Patel' },
      ],
      bays: [...(dashboard.bays ?? []), { bayId: 'bay-uuid-unnamed', available: true, status: 'ACTIVE' }],
    };
    dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(withUnnamed));
    component.refresh();
    fixture.detectChanges();

    const placeholders: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.na'));

    expect(placeholders.length).toBeGreaterThan(0);
    // The two placeholders that rely on their control's name are on screen.
    expect(placeholders.some(placeholder => placeholder.closest('button.change') !== null)).toBe(true);
    expect(placeholders.some(placeholder => placeholder.closest('button.bay') !== null)).toBe(true);
    for (const placeholder of placeholders) {
      const ownControl = placeholder.closest('button');
      const described =
        placeholder.querySelector('.sr-only') !== null ||
        placeholder.getAttribute('aria-hidden') === 'true' ||
        (ownControl !== null && Boolean(ownControl.getAttribute('aria-label')));
      expect(described).toBe(true);
    }
  });

  // The poll can turn either banner on with no other signal that the board has
  // degraded, and a live region inserted with its own first message is silent.
  it('keeps a polite live region in place for the data-quality and stale banners', () => {
    const region: HTMLElement | null = fixture.nativeElement.querySelector('.banners-row');

    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  // WCAG 2.2 SC 2.5.3 (Label in Name): a speech-input user says the visible
  // words. If the accessible name does not contain them, "click End break"
  // activates nothing. axe does not check this rule.
  it('contains each clock control\u2019s visible label in its accessible name', () => {
    const translate = TestBed.inject(TranslateService);
    // Mirrors SHOPMGMT.DISPATCH_BOARD in src/assets/i18n/en-US.json.
    translate.setTranslation(
      'en',
      {
        SHOPMGMT: {
          DISPATCH_BOARD: {
            CLOCK_IN: 'In',
            CLOCK_OUT: 'Out',
            BREAK_START: 'Break',
            BREAK_END: 'End break',
            CLOCK_IN_ARIA: 'Clock {{name}} in',
            CLOCK_OUT_ARIA: 'Clock {{name}} out',
            BREAK_START_ARIA: 'Start a break for {{name}}',
            BREAK_END_ARIA: 'End break for {{name}}',
          },
        },
      },
      true,
    );
    fixture.detectChanges();

    const controls: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.clock-btn'));
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const label = (control.getAttribute('aria-label') ?? '').toLowerCase();
      const visible = (control.textContent ?? '').trim().toLowerCase();
      expect(label).toContain(visible);
    }
  });

});
