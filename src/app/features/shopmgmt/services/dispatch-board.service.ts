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

/**
 * The SDK's `PrimaryLocationResponse` always carries a location; a persona
 * with no primary assignment is answered with 404 instead. The pages treat a
 * blank `locationId` as their location-required state, so 404 is surfaced as
 * that blank rather than as an error (#201).
 */
export type PrimaryLocation = Partial<PrimaryLocationResponse>;

/** A bay's type classification, keyed by bay id. */
export type BayKinds = ReadonlyMap<string, string>;

/** The Durion skill codes a technician is credentialled for, keyed by person id. */
export type TechnicianSkills = ReadonlyMap<string, readonly string[]>;

/** One page is enough for a single shop's bays and technicians. */
const ROSTER_PAGE_SIZE = 200;

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
   * Bay type classifications from the location domain. The dashboard's own
   * `BayStatus` carries occupancy and a name but no type, so the board reads the
   * classification here to label an open bay with the work it takes.
   *
   * Enrichment, not the board itself: a failure yields an empty map and the bays
   * render untyped rather than failing the page.
   */
  getBayKinds(locationId: string): Observable<BayKinds> {
    return this.bayApi.listBays(locationId.trim(), undefined, undefined, 0, ROSTER_PAGE_SIZE).pipe(
      map(page => {
        const kinds = new Map<string, string>();
        for (const bay of page.content ?? []) {
          if (bay.id && bay.bayType) {
            kinds.set(bay.id, bay.bayType);
          }
        }
        return kinds as BayKinds;
      }),
      catchError(() => of(new Map<string, string>() as BayKinds)),
    );
  }

  /**
   * Skill codes per technician, from shop management's HR-synchronized roster.
   * One call for the whole shop — the People credential endpoint is per person.
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
            const codes = (entry.credentials ?? [])
              .map(credential => credential.skillCode)
              .filter((code): code is string => Boolean(code));
            skills.set(personId, Array.from(new Set(codes)));
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
    if (currentTechnicianId) {
      return this.technicianAssignmentApi.reassignTechnician(workorderId, { newTechnicianId: technicianId });
    }
    return this.technicianAssignmentApi.assignTechnician(workorderId, { technicianId });
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

  private toIsoDate(value: string): string {
    // Accept an already-correct date string to avoid timezone drift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
  }
}
