
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * (issue #378, revisited #350) Backend #2206 shipped `ShortageResolutionService`
 * (`listShortageOptions`/`resolveShortage`, both migrated onto the SDK in
 * `InventoryDomainService`), deriving sku/shortQuantity from the named allocation when
 * omitted. But this page's route only ever supplies workorderId and allocationLineId, and
 * there is still no read that returns a workorder's allocationId: the
 * reservation/allocation endpoints expose no GET-by-id, and the pick-list/pick-task
 * responses carry neither an allocationId nor a workorderLineId to join against. Every
 * call would still 404/422, so this page shows a notice instead of calling the backend
 * until backend louisburroughs/durion-positivity-backend#2233 (allocations for a
 * workorder) supplies the missing data.
 */
@Component({
  selector: 'app-shortage-resolution-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './shortage-resolution-page.component.html',
  styleUrls: ['./shortage-resolution-page.component.css'],
})
export class ShortageResolutionPageComponent {}
