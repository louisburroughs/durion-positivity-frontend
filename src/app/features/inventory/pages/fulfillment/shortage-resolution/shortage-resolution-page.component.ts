
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * (issue #378) `ShortageController.listShortageOptions`/`resolveShortage` require
 * allocationId, sku, shortQuantity, workorderLineId and siteId (plus an
 * idempotencyKey for resolve). This page's route only ever supplies workorderId and
 * allocationLineId, and there is no cheap existing read to fill the rest: the
 * reservation/allocation endpoints expose no GET-by-id, and the pick-list/pick-task
 * responses carry neither an allocationId nor a workorderLineId to join against. Every
 * call would 400, so this page shows a notice instead of calling the backend until
 * backend #2206 supplies the missing data.
 */
@Component({
  selector: 'app-shortage-resolution-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './shortage-resolution-page.component.html',
  styleUrls: ['./shortage-resolution-page.component.css'],
})
export class ShortageResolutionPageComponent {}
