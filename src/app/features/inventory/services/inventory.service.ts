import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  InventoryAvailabilityService,
  InventoryLedgerEntryDto,
  InventoryLedgerService,
  InventoryReferenceDataService,
  LedgerPage,
  PutawayExecutionResponse as SdkPutawayExecutionResponse,
  PutawayExecutionService,
  PutawayService,
  PutawayTaskResponse,
  ReasonCodeDto,
  ReplenishmentService,
  ReplenishmentTaskResponse,
  ReturnLineDto,
  ReturnSubmissionResultDto,
  ReturnSubmitRequest,
  ReturnableItemDto,
  ShortageOptionDto,
  ShortageResolutionResultDto,
  ShortageResolutionService,
  ShortageResolveRequest,
  ReturnsService,
} from '@durion-sdk/inventory';
import { pageContent } from '../../../core/utils/spring-page';
import {
  AvailabilityView,
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
  LocationRef,
  LocationZone,
  PutawayExecuteRequest,
  PutawayExecutionResult,
  PutawayTask,
  ReturnReasonCode,
  ReturnToStockRequest,
  ReturnToStockResult,
  ReturnableItem,
  ReplenishmentTask,
  ShortageOption,
  ShortageResolutionRequest,
  ShortageResolutionResult,
  StorageLocation,
} from '../models/inventory.models';

/**
 * Minimal shapes of the paged reference-data DTOs. The generated inventory SDK
 * types these list endpoints loosely as `Observable<string>`, so the concrete
 * response fields are described here and narrowed via {@link pageContent}.
 */
interface InventoryLocationDto {
  locationId?: string;
  name?: string;
  active?: boolean;
}

interface InventoryStorageLocationDto {
  storageLocationId?: string;
  locationId?: string;
  code?: string;
  active?: boolean;
}

interface InventoryLocationZoneDto {
  zoneId?: string;
  zoneName?: string;
  locationId?: string;
}

/**
 * `LedgerPage.entries` is typed `Array<any>` in the generated SDK (the backend response is a
 * real `InventoryLedgerEntryDto[]`, but the OpenAPI generator lost the element type on this
 * one operation). This narrow local shape lets `listInventoryLedger`'s entries and
 * `getInventoryLedgerEntry`'s single DTO share one defensive mapper instead of trusting `any`.
 */
interface LedgerEntryLike {
  ledgerEntryId?: string;
  timestamp?: string;
  eventType?: string;
  stockItemId?: string;
  changeInQuantity?: number;
  unitOfMeasure?: string;
  fromLocationId?: string;
  toLocationId?: string;
  transactionUserId?: string;
  reasonCode?: string;
  sourceTransactionId?: string;
  workorderId?: string;
  workorderLineId?: string;
}

@Injectable({ providedIn: 'root' })
export class InventoryDomainService {
  private readonly refDataSdk = inject(InventoryReferenceDataService);
  private readonly availabilitySdk = inject(InventoryAvailabilityService);
  private readonly returnsSdk = inject(ReturnsService);
  private readonly putawayExecutionSdk = inject(PutawayExecutionService);
  private readonly ledgerSdk = inject(InventoryLedgerService);
  private readonly putawaySdk = inject(PutawayService);
  private readonly replenishmentSdk = inject(ReplenishmentService);
  private readonly shortageSdk = inject(ShortageResolutionService);

  queryAvailability(
    sku: string,
    locationId?: string,
    storageLocationId?: string,
  ): Observable<AvailabilityView[]> {
    return this.availabilitySdk.listAvailabilityBySku(sku, locationId, storageLocationId).pipe(
      map(view => (view ? [view as unknown as AvailabilityView] : [])),
    );
  }

  getLocations(): Observable<LocationRef[]> {
    return (this.refDataSdk.listInventoryLocations(undefined, undefined, 200) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryLocationDto>(page).map(dto => ({
        locationId: dto.locationId ?? '',
        name: dto.name ?? '',
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getStorageLocations(locationId: string): Observable<StorageLocation[]> {
    return (this.refDataSdk.listInventoryStorageLocations(locationId, undefined, 500) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryStorageLocationDto>(page).map(dto => ({
        storageLocationId: dto.storageLocationId ?? '',
        locationId: dto.locationId ?? '',
        name: dto.code ?? '',
        barcode: undefined,
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getLocationZones(locationId: string): Observable<LocationZone[]> {
    return (this.refDataSdk.listInventoryLocationZones(locationId, undefined, 500) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryLocationZoneDto>(page).map(dto => ({
        zoneId: dto.zoneId ?? '',
        zoneName: dto.zoneName ?? '',
        locationId: dto.locationId ?? '',
      }))),
    );
  }

  // Backend #2206/#2227: storageLocationId, workorderId and workorderLineId are accepted by
  // listInventoryLedger but not yet applied server-side (the ledger has no storage-location
  // column, and the docblock says workorder filters aren't wired up yet); they're still passed
  // through so filtering starts working the moment the backend catches up.
  queryLedger(filter: LedgerFilter): Observable<LedgerPageResponse> {
    return this.ledgerSdk
      .listInventoryLedger(
        filter.productSku,
        filter.locationId,
        filter.storageLocationId,
        filter.dateFrom,
        filter.dateTo,
        filter.sourceTransactionId,
        filter.workorderId,
        filter.workorderLineId,
        filter.movementTypes,
        filter.pageToken,
        filter.pageSize,
      )
      .pipe(map(page => this.toLedgerPageResponse(page)));
  }

  getLedgerEntry(ledgerEntryId: string): Observable<InventoryLedgerEntry> {
    return this.ledgerSdk
      .getInventoryLedgerEntry(ledgerEntryId)
      .pipe(map(dto => this.toInventoryLedgerEntry(dto)));
  }

  getPutawayTasks(locationId?: string): Observable<PutawayTask[]> {
    return this.putawaySdk
      .listPutawayTasks(locationId)
      .pipe(map(tasks => tasks.map(dto => this.toPutawayTask(dto))));
  }

  /**
   * (issue #377) The backend has no `/putaway/tasks/{taskId}/complete` endpoint;
   * `PutawayExecuteController` only exposes `POST .../tasks/{taskId}/execute`, whose
   * `PutawayExecutionRequest` (skuId/sourceLocationId/destinationLocationId/quantity)
   * matches the SDK's `PutawayExecutionService.executePutaway` exactly.
   */
  executePutawayTask(taskId: string, request: PutawayExecuteRequest): Observable<PutawayExecutionResult> {
    return this.putawayExecutionSdk
      .executePutaway(taskId, {
        skuId: request.skuId,
        sourceLocationId: request.sourceLocationId,
        destinationLocationId: request.destinationLocationId,
        quantity: request.quantity,
      })
      .pipe(map(response => this.toPutawayExecutionResult(response)));
  }

  // `listReplenishmentTasks` (backend #2206) has no locationId filter — every open task is
  // returned and this filters client-side, matching the page's prior locationId-scoped view.
  getReplenishmentTasks(locationId?: string): Observable<ReplenishmentTask[]> {
    return this.replenishmentSdk.listReplenishmentTasks().pipe(
      map(tasks => tasks
        .filter(dto => !locationId || dto.locationId === locationId)
        .map(dto => this.toReplenishmentTask(dto))),
    );
  }

  getReturnableItems(workorderId: string): Observable<ReturnableItem[]> {
    return this.returnsSdk
      .listReturnableItems(workorderId)
      .pipe(map(dtos => dtos.map(dto => this.toReturnableItem(dto))));
  }

  // `type` is unused by the SDK's fixed reason-code catalog (no filter support) but
  // stays in the signature so callers don't churn.
  getReasonCodes(_type: string): Observable<ReturnReasonCode[]> {
    return this.returnsSdk.listReturnReasonCodes().pipe(
      map((codes: ReasonCodeDto[]) => codes.map(dto => this.toReturnReasonCode(dto))),
    );
  }

  // `ReturnSubmitRequest.lines[].itemId` names the workorder line (backend #2206/#2227:
  // `ReturnServiceImpl.submitToStock` keys every line by `workorderLineId`), and each SDK line
  // carries the destination `locationId`/`storageLocationId`/`reasonCode` individually, so the
  // request's header fields are copied onto every line.
  submitReturnToStock(request: ReturnToStockRequest): Observable<ReturnToStockResult> {
    const sdkRequest: ReturnSubmitRequest = {
      workorderId: request.workorderId,
      lines: request.lines.map((line): ReturnLineDto => ({
        itemId: line.workorderLineId,
        quantity: line.quantityToReturn,
        reasonCode: request.reasonCode,
        locationId: request.locationId,
        storageLocationId: request.storageLocationId,
      })),
    };
    return this.returnsSdk
      .submitReturnToStock(sdkRequest)
      .pipe(map(dto => this.toReturnToStockResult(dto)));
  }

  getShortageOptions(
    allocationId: string,
    sku?: string,
    shortQuantity?: number,
    workorderLineId?: string,
    locationId?: string,
  ): Observable<ShortageOption[]> {
    return this.shortageSdk
      .listShortageOptions(allocationId, sku, shortQuantity, workorderLineId, locationId)
      .pipe(map(dtos => dtos.map(dto => this.toShortageOption(dto))));
  }

  resolveShortage(request: ShortageResolutionRequest): Observable<ShortageResolutionResult> {
    const sdkRequest: ShortageResolveRequest = {
      allocationId: request.allocationId,
      // The SDK's enum is a closed string union of the same option names the local model
      // already carries as `string`; the cast is safe because the caller only ever forwards
      // one of ShortageOptionDtoOptionTypeEnum's values.
      optionType: request.optionType as ShortageResolveRequest['optionType'],
      sku: request.sku,
      shortQuantity: request.shortQuantity,
      workorderLineId: request.workorderLineId,
      locationId: request.locationId,
      sourceLocationId: request.sourceLocationId,
      substituteSku: request.substituteSku,
      notes: request.notes,
      idempotencyKey: request.idempotencyKey,
    };
    return this.shortageSdk
      .resolveShortage(sdkRequest)
      .pipe(map(dto => this.toShortageResolutionResult(dto)));
  }

  private toReturnReasonCode(dto: ReasonCodeDto): ReturnReasonCode {
    return { code: dto.code, label: dto.description };
  }

  private toPutawayExecutionResult(response: SdkPutawayExecutionResponse): PutawayExecutionResult {
    return {
      ledgerEntryId: response.ledgerEntryId,
      taskId: response.taskId,
      skuId: response.skuId,
      sourceLocationId: response.sourceLocationId,
      destinationLocationId: response.destinationLocationId,
      quantityMoved: response.quantityMoved,
      transactionType: response.transactionType,
      status: response.status,
      executedAt: response.executedAt,
      actorId: response.actorId,
    };
  }

  private toLedgerPageResponse(page: LedgerPage): LedgerPageResponse {
    const entries = Array.isArray(page.entries) ? page.entries : [];
    return {
      items: entries.map(entry => this.toInventoryLedgerEntry(entry as LedgerEntryLike)),
      nextPageToken: page.nextPageToken ?? null,
    };
  }

  private toInventoryLedgerEntry(dto: LedgerEntryLike | InventoryLedgerEntryDto): InventoryLedgerEntry {
    return {
      ledgerEntryId: dto.ledgerEntryId ?? '',
      timestamp: dto.timestamp ?? '',
      movementType: dto.eventType ?? '',
      productSku: dto.stockItemId ?? '',
      quantityChange: dto.changeInQuantity ?? 0,
      uom: dto.unitOfMeasure ?? '',
      fromLocationId: dto.fromLocationId ?? undefined,
      toLocationId: dto.toLocationId ?? undefined,
      actorId: dto.transactionUserId ?? undefined,
      reasonCode: dto.reasonCode ?? undefined,
      sourceTransactionId: dto.sourceTransactionId ?? undefined,
      workorderId: dto.workorderId ?? undefined,
      workorderLineId: dto.workorderLineId ?? undefined,
    };
  }

  private toPutawayTask(dto: PutawayTaskResponse): PutawayTask {
    return {
      taskId: dto.taskId,
      sourceReceiptId: dto.sourceReceiptId,
      productId: dto.productId,
      quantity: dto.quantity,
      sourceLocationId: dto.sourceLocationId ?? '',
      suggestedDestinationLocationId: dto.suggestedDestinationLocationId,
      actualDestinationLocationId: dto.actualDestinationLocationId,
      status: dto.status,
      assigneeId: dto.assigneeId,
      locationId: dto.locationId,
      uom: dto.uom,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }

  private toReplenishmentTask(dto: ReplenishmentTaskResponse): ReplenishmentTask {
    return {
      replenishmentTaskId: dto.taskId,
      locationId: dto.locationId ?? '',
      fromStorageLocationId: dto.sourceLocationId ?? '',
      toStorageLocationId: dto.destinationLocationId,
      productSku: dto.itemSKU,
      requestedQty: dto.quantity,
      uom: dto.uom ?? '',
      status: dto.status,
    };
  }

  private toReturnableItem(dto: ReturnableItemDto): ReturnableItem {
    return {
      workorderLineId: dto.workorderLineId,
      productSku: dto.sku,
      description: dto.description,
      maxReturnableQty: dto.quantityReturnable,
      uom: dto.uom ?? '',
    };
  }

  private toReturnToStockResult(dto: ReturnSubmissionResultDto): ReturnToStockResult {
    return {
      returnId: dto.returnId,
      workorderId: dto.workorderId,
      processedLineCount: dto.processedLines,
      status: dto.status,
      createdAt: dto.processedAt,
    };
  }

  private toShortageOption(dto: ShortageOptionDto): ShortageOption {
    return {
      allocationId: dto.allocationId,
      optionType: dto.optionType,
      description: dto.description,
      availableQuantity: dto.availableQuantity,
      costDelta: dto.costDelta,
      expectedResolutionDate: dto.expectedResolutionDate,
      sourceLocationId: dto.sourceLocationId,
      substituteSku: dto.substituteSku,
    };
  }

  private toShortageResolutionResult(dto: ShortageResolutionResultDto): ShortageResolutionResult {
    return {
      allocationId: dto.allocationId,
      optionType: dto.optionType,
      artifactId: dto.artifactId,
      artifactType: dto.artifactType,
      idempotencyKey: dto.idempotencyKey,
      status: dto.status,
      resolvedAt: dto.resolvedAt,
    };
  }
}
