import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  MechanicRosterAPIService,
  MechanicRosterEntryResponseStatusEnum,
  type Pageable,
  type PagedModelMechanicRosterEntryResponse,
} from '@durion-sdk/shop-manager';

export interface MechanicRosterQuery {
  readonly status: MechanicRosterEntryResponseStatusEnum;
  readonly page: number;
  readonly size: number;
}

@Injectable({ providedIn: 'root' })
export class ShopmgmtRosterService {
  private readonly mechanicRosterApi = inject(MechanicRosterAPIService);

  listMechanics(query: MechanicRosterQuery): Observable<PagedModelMechanicRosterEntryResponse> {
    const pageable: Pageable = { page: query.page, size: query.size };
    return this.mechanicRosterApi.listMechanics(pageable, query.status);
  }
}
