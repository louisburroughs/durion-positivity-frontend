import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  AssignServicePositionRequestResourceTypeEnum,
  DailyDispatchBoardDashboardService,
  ServicePositionAPIService,
  TechnicianAssignmentAPIService,
} from '@durion-sdk/workorder';
import { BayAPIService } from '@durion-sdk/location';
import { TechnicianAPIService } from '@durion-sdk/shop-manager';
import { PeopleAvailabilityAPIService, PeopleAvailabilityResponse, PrimaryLocationResponse } from '@durion-sdk/people';
import { DashboardResponse } from '../models/dispatch-board.models';
import { isoDateLocal } from '../models/capacity-calendar.models';
import { v4 as uuidv4 } from 'uuid';
import { heldSkillCodes } from './capacity-calendar.service';

/**
 * The SDK's `PrimaryLocationResponse` always carries a location; a persona
 * with no primary assignment is answered with 404 instead. The pages treat a
 * blank `locationId` as their location-required state, so 404 is surfaced as
 * that blank rather than as an error (#201).
 */
export type PrimaryLocation = Partial<PrimaryLocationResponse>;

/** One bay as the location inventory knows it. */
export interface BayInventoryEntry {
  readonly bayId: string;
  /** Null when the inventory carries no name — never the raw id. */
  readonly name: string | null;
  /** `bayType` from the location domain. */
  readonly kind: string | null;
  readonly outOfService: boolean;
}

/** The location's bays, keyed by bay id. */
export type BayInventory = ReadonlyMap<string, BayInventoryEntry>;

/** The Durion skill codes a technician is credentialled for, keyed by person id. */
export type TechnicianSkills = ReadonlyMap<string, readonly string[]>;

/**
 * One page is enough for a single shop's bays and technicians, at the same cap
 * ShopDashboardService and CapacityCalendarService use for these very endpoints.
 * A smaller cap silently drops rows, and the board reads a missing bay as absent
 * rather than as unfetched.
 */
const ROSTER_PAGE_SIZE = 500;

/** pos-location's bay lifecycle status, as the other shopmgmt services read it. */
const BAY_OUT_OF_SERVICE = 'OUT_OF_SERVICE';

@Injectable({ providedIn: 'root' })
export class DispatchBoardService {
  private readonly dispatchDashboard = inject(DailyDispatchBoardDashboardService);
  private readonly peopleAvailabilityApi = inject(PeopleAvailabilityAPIService);
  private readonly technicianAssignmentApi = inject(TechnicianAssignmentAPIService);
  private readonly servicePositionApi = inject(ServicePositionAPIService);
  private readonly bayApi = inject(BayAPIService);
  private readonly technicianApi = inject(TechnicianAPIService);

  getDashboard(locationId: string, date: string): Observable<DashboardResponse> {
    const normalizedDate = this.toIsoDate(date);
    return this.dispatchDashboard.getDispatchDashboard(locationId.trim(), normalizedDate) as Observable<DashboardResponse>;
  }

  getPrimaryLocation(): Observable<PrimaryLocation> {
    return this.peopleAvailabilityApi.getMyPrimaryLocation().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          // Expected data absence, not a failure: no primary location assigned.
          return of({ locationId: undefined });
        }
        // Authentication, authorization and server errors stay visible.
        return throwError(() => error);
      }),
    );
  }

  getAvailability(locationId: string, date: string): Observable<PeopleAvailabilityResponse[]> {
    const normalizedDate = this.toIsoDate(date);
    return this.peopleAvailabilityApi.listPeopleAvailability(locationId.trim(), normalizedDate);
  }

  /**
   * The location's own bay roster, with each bay's type.
   *
   * The **location inventory is the roster of record**, not `dashboard.bays`:
   * pos-workorder serves bay identity from an event-fed replica and omits a bay
   * whose row has not arrived, so a bay the shop really has can be missing from
   * the dispatch projection entirely. The shop dashboard already reads the
   * inventory for the same reason; this board merges the two.
   *
   * Enrichment, not the board itself: a failure yields an empty map and the rail
   * falls back to whatever the dispatch projection knows.
   */
  getBayInventory(locationId: string): Observable<BayInventory> {
    return this.bayApi.listBays(locationId.trim(), undefined, undefined, 0, ROSTER_PAGE_SIZE).pipe(
      map(page => {
        const inventory = new Map<string, BayInventoryEntry>();
        for (const bay of page.content ?? []) {
          if (!bay.id) {
            continue;
          }
          inventory.set(bay.id, {
            bayId: bay.id,
            name: bay.name?.trim() || null,
            kind: bay.bayType ?? null,
            outOfService: bay.status === BAY_OUT_OF_SERVICE,
          });
        }
        return inventory as BayInventory;
      }),
      catchError(() => of(new Map<string, BayInventoryEntry>() as BayInventory)),
    );
  }

  /**
   * Skill codes per technician, from shop management's HR-synchronized roster.
   * One call for the whole shop — the People credential endpoint is per person.
   *
   * Only ACTIVE credentials count, through the capacity calendar's own
   * `heldSkillCodes`: an expired, revoked or superseded certification is not
   * competence, and showing it would both mislabel the chip and float the
   * technician up the picker's credentialled-first ordering.
   *
   * Enrichment, as above: a failure yields an empty map and the mechanic chips
   * render without their certification codes.
   */
  getTechnicianSkills(locationId: string): Observable<TechnicianSkills> {
    return this.technicianApi
      .listLocationTechnicians(locationId.trim(), 'ACTIVE', undefined, 0, ROSTER_PAGE_SIZE)
      .pipe(
        map(page => {
          const skills = new Map<string, readonly string[]>();
          for (const entry of page.content ?? []) {
            const personId = entry.personId ?? entry.mechanicId;
            if (!personId) {
              continue;
            }
            skills.set(personId, Array.from(new Set(heldSkillCodes(entry.credentials))));
          }
          return skills as TechnicianSkills;
        }),
        catchError(() => of(new Map<string, readonly string[]>() as TechnicianSkills)),
      );
  }

  /**
   * Put a technician on a workorder. `assignTechnician` refuses a workorder that
   * already has one (409 TECHNICIAN_ALREADY_ASSIGNED) and `reassignTechnician`
   * refuses one that has none (409 TECHNICIAN_NOT_ASSIGNED), so the caller's
   * knowledge of the incumbent picks the endpoint — neither is promoted to the other.
   */
  assignMechanic(workorderId: string, technicianId: string, currentTechnicianId: string | null): Observable<unknown> {
    // One key per attempt, as the workexec assign page does. A write the
    // backend applied but whose response was lost would otherwise come back as
    // ALREADY_ASSIGNED on retry, and the board would report a failure over a
    // change that did land.
    if (currentTechnicianId) {
      return this.technicianAssignmentApi.reassignTechnician(
        workorderId,
        { newTechnicianId: technicianId },
        uuidv4(),
      );
    }
    return this.technicianAssignmentApi.assignTechnician(workorderId, { technicianId }, uuidv4());
  }

  releaseMechanic(workorderId: string): Observable<unknown> {
    return this.technicianAssignmentApi.releaseTechnician(workorderId);
  }

  /** Place the workorder on a bay. Moving between bays is the same call. */
  assignBay(workorderId: string, bayId: string): Observable<unknown> {
    return this.servicePositionApi.assignServicePosition(workorderId, {
      resourceType: AssignServicePositionRequestResourceTypeEnum.Bay,
      resourceId: bayId,
    });
  }

  releaseBay(workorderId: string): Observable<unknown> {
    return this.servicePositionApi.releaseServicePosition(workorderId);
  }

  /**
   * Park the workorder on the site's HOLD position. Parking is not releasing:
   * a released workorder is placed nowhere, a parked one stands in the site's
   * own lot. `HOLD` defaults `resourceId` to the workorder's locationId and any
   * other value is a 422, so none is sent.
   */
  parkWorkorder(workorderId: string): Observable<unknown> {
    return this.servicePositionApi.assignServicePosition(workorderId, {
      resourceType: AssignServicePositionRequestResourceTypeEnum.Hold,
    });
  }

  private toIsoDate(value: string): string {
    // Accept an already-correct date string to avoid timezone drift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    // The local calendar day, never `toISOString()`: that is the UTC date,
    // which from 17:00 Pacific onward is already tomorrow (ADR-0038).
    const parsed = new Date(value);
    return isoDateLocal(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
  }
}
