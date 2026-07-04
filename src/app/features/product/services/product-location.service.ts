import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  LocationAPIService,
  PageLocationRef,
  LocationRef as SdkLocationRef,
  LocationResponseDTO,
  LocationValidationResponseDTO,
  Pageable,
} from '@durion-sdk/location';
import {
  LocationRef,
  LocationRosterEntry,
  LocationStatus,
  LocationValidationResult,
  LocationValidationStatus,
} from '../models/location.models';

@Injectable({ providedIn: 'root' })
export class ProductLocationService {
  private readonly locationSdk = inject(LocationAPIService);

  getRoster(filter?: { status?: string }): Observable<LocationRosterEntry[]> {
    const pageable: Pageable = {};
    return this.locationSdk.getRoster(pageable, filter?.status).pipe(
      map((page: PageLocationRef) =>
        (page.content ?? []).map(ref => this.toLocationRosterEntry(ref)),
      ),
    );
  }

  getAllLocations(): Observable<LocationRef[]> {
    return this.locationSdk.getAllLocations().pipe(
      map((items: Array<LocationResponseDTO>) => items.map(dto => this.toLocationRef(dto))),
    );
  }

  validateLocation(locationId: string): Observable<LocationValidationResult> {
    return this.locationSdk.validateLocation(locationId).pipe(
      map((dto: LocationValidationResponseDTO) => this.toLocationValidationResult(dto)),
    );
  }

  // =========================================================================
  // Private adapters
  // =========================================================================

  private toLocationRosterEntry(dto: SdkLocationRef): LocationRosterEntry {
    return {
      id: dto.id ?? '',
      name: dto.name ?? '',
      status: (dto.status ?? 'INACTIVE') as LocationStatus,
      code: dto.code ?? '',
      lastValidatedAt: dto.updatedAt ?? '',
      validationStatus: 'STALE' as LocationValidationStatus,
    };
  }

  private toLocationRef(dto: LocationResponseDTO): LocationRef {
    return {
      id: dto.id ?? '',
      name: dto.name ?? '',
    };
  }

  private toLocationValidationResult(dto: LocationValidationResponseDTO): LocationValidationResult {
    return {
      locationId: dto.locationId ?? '',
      valid: dto.exists === true && dto.active === true,
      errors: [],
      validatedAt: '',
    };
  }
}
