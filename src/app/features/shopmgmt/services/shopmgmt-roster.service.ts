import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  MechanicRosterAPIService,
  MechanicRosterEntryResponseStatusEnum,
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

  /**
   * SDK 0.11 replaced the `Pageable` object with flattened positional
   * arguments: `listMechanics(status, skillCode, page, size, sort)`. The
   * roster page filters on status only, so `skillCode` and `sort` are omitted
   * — passing them positionally is what keeps `page`/`size` in the right slots.
   */
  listMechanics(query: MechanicRosterQuery): Observable<PagedModelMechanicRosterEntryResponse> {
    return this.mechanicRosterApi.listMechanics(query.status, undefined, query.page, query.size);
  }
}
