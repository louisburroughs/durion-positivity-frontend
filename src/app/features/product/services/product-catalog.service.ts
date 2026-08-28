import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ProductsAPIService,
  ItemCostAPIService,
  PriceBookAPIService,
  UOMConversionAPIService,
  ProductMSRPAPIService,
  CatalogSearchResultDto,
  ServiceDto,
  ProductDto,
  ProductLifecycleResponse,
  ReplacementOption,
  ProductCreateRequestDto,
  ProductUpdateRequestDto,
  ProductLifecycleUpdateRequest,
  ProductReplacementRequest,
  ItemCostsDto,
  ItemCostAuditDto,
  UpdateStandardCostRequestDto,
  PriceBookDto,
  PriceBookRuleDto,
  PriceBookCreateRequestDto,
  PriceBookRuleCreateRequestDto,
  ProductMsrpDto,
  CreateMsrpRequestDto,
  UpdateMsrpRequestDto,
  LocationPriceOverrideResponseDto,
  LocationPriceOverrideCreateRequestDto,
  LocationPriceOverrideDecisionRequestDto,
  EffectiveLocationPriceResponseDto,
  GuardrailPolicyUpsertRequestDto,
  UomConversionDto,
  UomConversionCreateRequestDto,
  UomConversionUpdateRequestDto,
  ProductSummary as SdkProductSummary,
  PriceBookCreateRequestDtoScopeEnum,
  PriceBookRuleCreateRequestDtoTargetTypeEnum,
  PriceBookRuleCreateRequestDtoConditionTypeEnum,
} from '@durion-sdk/catalog';
import {
  LifecycleState,
  LifecycleStateTransition,
  Product,
  ProductLifecycle,
  ProductSummary,
  ReplacementProduct,
  ServiceSummary,
  UomConversion,
} from '../models/product.models';
import {
  CostAuditEntry,
  ItemCost,
  StandardCostUpdate,
} from '../models/cost.models';
import {
  ActiveMsrp,
  EffectiveLocationPrice,
  GuardrailPolicy,
  LocationPriceOverride,
  LocationPriceOverrideStatus,
  Msrp,
  PriceBook,
  PriceBookScope,
  PriceRule,
} from '../models/pricing.models';

@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  private readonly productsSdk = inject(ProductsAPIService);
  private readonly itemCostSdk = inject(ItemCostAPIService);
  private readonly priceBookSdk = inject(PriceBookAPIService);
  private readonly uomSdk = inject(UOMConversionAPIService);
  private readonly msrpSdk = inject(ProductMSRPAPIService);

  // -------------------------------------------------------------------------
  // CAP-165 Product Master
  // -------------------------------------------------------------------------

  searchProducts(query: string): Observable<ProductSummary[]> {
    return this.productsSdk.searchCatalogProducts(query).pipe(
      map((result: CatalogSearchResultDto) => (result.data ?? []).map(s => this.toProductSummary(s))),
    );
  }

  /**
   * Search results enriched with lifecycle state, effective date, and active MSRP,
   * resolved server-side in a single request via `detailed=true`. Rows without an
   * active MSRP come back with null price fields.
   */
  searchProductsDetailed(query: string): Observable<ProductSummary[]> {
    return this.productsSdk
      .searchCatalogProducts(query, undefined, undefined, undefined, undefined, undefined, true)
      .pipe(
        map((result: CatalogSearchResultDto) =>
          (result.data ?? []).map(s => this.toProductSummary(s)),
        ),
      );
  }

  searchServices(query: string): Observable<ServiceSummary[]> {
    return this.productsSdk.searchCatalogServices(query).pipe(
      map((services: Array<ServiceDto>) => services.map(s => this.toServiceSummary(s))),
    );
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    return this.productsSdk.createProduct(this.toCreateProductRequest(product)).pipe(
      map((dto: ProductDto) => this.toProduct(dto)),
    );
  }

  getProductById(productId: string): Observable<Product> {
    return this.productsSdk.getProductById(productId).pipe(
      map((dto: ProductDto) => this.toProduct(dto)),
    );
  }

  updateProduct(productId: string, update: Partial<Product>): Observable<Product> {
    return this.productsSdk.updateProduct(productId, this.toUpdateProductRequest(update)).pipe(
      map((dto: ProductDto) => this.toProduct(dto)),
    );
  }

  // -------------------------------------------------------------------------
  // CAP-165 Lifecycle
  // -------------------------------------------------------------------------

  getProductLifecycle(productId: string): Observable<ProductLifecycle> {
    return this.productsSdk.getProductLifecycle(productId).pipe(
      map((dto: ProductLifecycleResponse) => this.toProductLifecycle(dto)),
    );
  }

  setLifecycleState(
    productId: string,
    transition: LifecycleStateTransition,
  ): Observable<ProductLifecycle> {
    return this.productsSdk.updateProductLifecycle(productId, this.toLifecycleUpdateRequest(transition)).pipe(
      map((dto: ProductLifecycleResponse) => this.toProductLifecycle(dto)),
    );
  }

  getReplacements(productId: string): Observable<ReplacementProduct[]> {
    return this.productsSdk.listProductReplacements(productId).pipe(
      map((items: Array<ReplacementOption>) => items.map(r => this.toReplacementProduct(r))),
    );
  }

  addReplacementProduct(
    productId: string,
    replacement: Partial<ReplacementProduct>,
  ): Observable<ReplacementProduct> {
    return this.productsSdk.addProductReplacement(productId, this.toReplacementRequest(replacement)).pipe(
      map((dto: ReplacementOption) => this.toReplacementProduct(dto)),
    );
  }

  // -------------------------------------------------------------------------
  // CAP-165 UOM
  // -------------------------------------------------------------------------

  listUomConversions(_productId: string): Observable<UomConversion[]> {
    return this.uomSdk.listUomConversions().pipe(
      map((items: Array<UomConversionDto>) => items.map(d => this.toUomConversion(d))),
    );
  }

  createUomConversion(
    _productId: string,
    conversion: Partial<UomConversion>,
  ): Observable<UomConversion> {
    return this.uomSdk.createUomConversion(this.toUomCreateRequest(conversion)).pipe(
      map((dto: UomConversionDto) => this.toUomConversion(dto)),
    );
  }

  updateUomConversion(
    _productId: string,
    conversionId: string,
    update: Partial<UomConversion>,
  ): Observable<UomConversion> {
    const req: UomConversionUpdateRequestDto = {
      conversionFactor: update.conversionFactor ?? 1,
    };
    return this.uomSdk.updateUomConversion(conversionId, req).pipe(
      map((dto: UomConversionDto) => this.toUomConversion(dto)),
    );
  }

  deactivateUomConversion(_productId: string, conversionId: string): Observable<void> {
    return this.uomSdk.deactivateUomConversion(conversionId).pipe(
      map(() => undefined),
    );
  }

  // -------------------------------------------------------------------------
  // CAP-166 Costs
  // -------------------------------------------------------------------------

  getItemCosts(itemId: string): Observable<ItemCost> {
    return this.itemCostSdk.getItemCosts(itemId).pipe(
      map((dto: ItemCostsDto) => this.toItemCost(dto)),
    );
  }


  updateStandardCost(itemId: string, update: StandardCostUpdate): Observable<ItemCost> {
    const req: UpdateStandardCostRequestDto = {
      newCost: update.standardCost,
      reasonCode: update.reasonCode,
    };
    return this.itemCostSdk.updateStandardItemCost(itemId, req).pipe(
      map((dto: ItemCostsDto) => this.toItemCost(dto)),
    );
  }

  getAuditHistory(itemId: string, _page?: number): Observable<CostAuditEntry[]> {
    // SDK returns a single ItemCostAuditDto (not an array); wrap in array
    return this.itemCostSdk.getItemCostAuditHistory(itemId).pipe(
      map((dto: ItemCostAuditDto) => [this.toCostAuditEntry(dto)]),
    );
  }

  // -------------------------------------------------------------------------
  // CAP-167 Pricing
  // -------------------------------------------------------------------------

  createPriceBook(priceBook: Partial<PriceBook>): Observable<PriceBook> {
    return this.priceBookSdk.createPriceBook(this.toPriceBookCreateRequest(priceBook)).pipe(
      map((dto: PriceBookDto) => this.toPriceBook(dto)),
    );
  }

  getPriceBook(priceBookId: string): Observable<PriceBook> {
    return this.priceBookSdk.getPriceBook(priceBookId).pipe(
      map((dto: PriceBookDto) => this.toPriceBook(dto)),
    );
  }

  updatePriceBook(priceBookId: string, update: Partial<PriceBook>): Observable<PriceBook> {
    return this.priceBookSdk.updatePriceBook(priceBookId, this.toPriceBookCreateRequest(update)).pipe(
      map((dto: PriceBookDto) => this.toPriceBook(dto)),
    );
  }

  listRules(priceBookId: string): Observable<PriceRule[]> {
    // SDK returns a single PriceBookRuleDto; wrap in array
    return this.priceBookSdk.listPriceBookRules(priceBookId).pipe(
      map((dto: PriceBookRuleDto) => [this.toPriceRule(dto)]),
    );
  }

  createRule(priceBookId: string, rule: Partial<PriceRule>): Observable<PriceRule> {
    return this.priceBookSdk.createPriceBookRule(priceBookId, this.toPriceRuleCreateRequest(rule)).pipe(
      map((dto: PriceBookRuleDto) => this.toPriceRule(dto)),
    );
  }

  updateRule(priceBookId: string, ruleId: string, update: Partial<PriceRule>): Observable<PriceRule> {
    return this.priceBookSdk.updatePriceBookRule(priceBookId, ruleId, this.toPriceRuleCreateRequest(update)).pipe(
      map((dto: PriceBookRuleDto) => this.toPriceRule(dto)),
    );
  }

  deactivateRule(priceBookId: string, ruleId: string): Observable<void> {
    return this.priceBookSdk.deactivatePriceBookRule(priceBookId, ruleId).pipe(
      map(() => undefined),
    );
  }

  listMsrp(productSku: string): Observable<Msrp[]> {
    // SDK returns a single ProductMsrpDto; wrap in array
    return this.msrpSdk.listProductMsrpHistory(productSku).pipe(
      map((dto: ProductMsrpDto) => [this.toMsrp(dto)]),
    );
  }

  createMsrp(msrp: Partial<Msrp>): Observable<Msrp> {
    const productId = msrp.productSku ?? '';
    return this.msrpSdk.createProductMsrp(productId, this.toCreateMsrpRequest(msrp)).pipe(
      map((dto: ProductMsrpDto) => this.toMsrp(dto)),
    );
  }

  updateMsrp(msrpId: string, update: Partial<Msrp>): Observable<Msrp> {
    const productId = update.productSku ?? '';
    return this.msrpSdk.updateProductMsrp(productId, msrpId, this.toUpdateMsrpRequest(update)).pipe(
      map((dto: ProductMsrpDto) => this.toMsrp(dto)),
    );
  }

  getActiveMsrp(productSku: string): Observable<ActiveMsrp | null> {
    return this.msrpSdk.getActiveProductMsrp(productSku).pipe(
      map((dto: ProductMsrpDto) => {
        const base = this.toMsrp(dto);
        const active: ActiveMsrp = { ...base, active: true };
        return active;
      }),
    );
  }

  // -------------------------------------------------------------------------
  // CAP-168 Location Overrides
  // -------------------------------------------------------------------------

  createLocationPriceOverride(
    override: Partial<LocationPriceOverride>,
  ): Observable<LocationPriceOverride> {
    return this.productsSdk.createLocationPriceOverride(this.toLocationOverrideCreateRequest(override)).pipe(
      map((dto: LocationPriceOverrideResponseDto) => this.toLocationPriceOverride(dto)),
    );
  }

  getEffectiveLocationPrice(locationId: string, productSku: string): Observable<EffectiveLocationPrice> {
    return this.productsSdk.getEffectiveLocationPrice(locationId, productSku).pipe(
      map((dto: EffectiveLocationPriceResponseDto) => this.toEffectiveLocationPrice(dto)),
    );
  }

  approveLocationPriceOverride(overrideId: string): Observable<LocationPriceOverride> {
    const req: LocationPriceOverrideDecisionRequestDto = { version: 0, actorUserId: '' };
    return this.productsSdk.approveLocationPriceOverride(overrideId, req).pipe(
      map((dto: LocationPriceOverrideResponseDto) => this.toLocationPriceOverride(dto)),
    );
  }

  rejectLocationPriceOverride(overrideId: string, reason: string): Observable<LocationPriceOverride> {
    const req: LocationPriceOverrideDecisionRequestDto = {
      version: 0,
      actorUserId: '',
      rejectionNotes: reason,
    };
    return this.productsSdk.rejectLocationPriceOverride(overrideId, req).pipe(
      map((dto: LocationPriceOverrideResponseDto) => this.toLocationPriceOverride(dto)),
    );
  }

  upsertLocationGuardrailPolicy(policy: GuardrailPolicy): Observable<GuardrailPolicy> {
    return this.productsSdk.upsertLocationGuardrailPolicy(this.toGuardrailUpsertRequest(policy)).pipe(
      map((dto: LocationPriceOverrideResponseDto) => this.guardrailFromOverrideResponse(dto, policy)),
    );
  }

  // =========================================================================
  // Private adapters — response DTOs → local models
  // =========================================================================

  private toProductSummary(dto: SdkProductSummary): ProductSummary {
    // Lifecycle/MSRP fields are only populated for detailed search (detailed=true);
    // for lean search they are absent and fall through to the empty defaults.
    const amount = dto.msrpAmount != null ? Number.parseFloat(dto.msrpAmount) : Number.NaN;
    return {
      id: dto.productId ?? '',
      name: dto.name ?? '',
      sku: dto.sku ?? '',
      category: dto.category ?? '',
      lifecycleState: dto.lifecycleState ?? '',
      // A missing or non-numeric amount degrades to null so the UI shows the
      // empty-value placeholder rather than a misleading $0.00.
      msrp: Number.isFinite(amount) ? amount : null,
      msrpCurrency: dto.msrpCurrency ?? 'USD',
      effectiveAt: dto.lifecycleStateEffectiveAt ?? '',
    };
  }

  private toServiceSummary(dto: ServiceDto): ServiceSummary {
    return {
      id: dto.id ?? '',
      name: dto.name ?? '',
      shortDescription: dto.shortDescription ?? '',
    };
  }

  private toProduct(dto: ProductDto): Product {
    return {
      id: dto.id ?? '',
      sku: dto.sku ?? '',
      name: dto.name ?? '',
      category: dto.category?.name ?? '',
      description: dto.description ?? dto.shortDescription ?? '',
      status: dto.status ?? '',
      msrp: null,
    };
  }

  private toProductLifecycle(dto: ProductLifecycleResponse): ProductLifecycle {
    return {
      productId: dto.productId ?? '',
      currentState: (dto.lifecycleState ?? '') as LifecycleState,
      effectiveAt: dto.lifecycleStateEffectiveAt ?? '',
      lastChangedBy: dto.lastStateChangedBy ?? '',
      lastChangedAt: dto.lastStateChangedAt ?? '',
    };
  }

  private toReplacementProduct(dto: ReplacementOption): ReplacementProduct {
    return {
      id: dto.replacementId ?? '',
      productId: '',
      replacementProductId: dto.replacementProductId ?? '',
      priority: dto.priorityOrder ?? 0,
      notes: dto.notes ?? '',
      effectiveAt: dto.effectiveAt ?? '',
    };
  }

  private toUomConversion(dto: UomConversionDto): UomConversion {
    return {
      id: dto.id ?? '',
      fromUom: dto.fromUomCode ?? '',
      toUom: dto.toUomCode ?? '',
      conversionFactor: dto.conversionFactor ?? 1,
      active: dto.active ?? false,
      createdAt: dto.createdAt ?? '',
      updatedAt: dto.updatedAt ?? '',
    };
  }

  private toItemCost(dto: ItemCostsDto): ItemCost {
    return {
      itemId: dto.itemId ?? '',
      standardCost: dto.standardCost ?? 0,
      lastCost: dto.lastCost ?? 0,
      averageCost: dto.averageCost ?? 0,
      currency: '',
    };
  }



  private toCostAuditEntry(dto: ItemCostAuditDto): CostAuditEntry {
    return {
      id: dto.auditId ?? '',
      field: dto.costTypeChanged ?? '',
      oldValue: dto.oldValue != null ? dto.oldValue.toString() : '',
      newValue: dto.newValue != null ? dto.newValue.toString() : '',
      changedBy: dto.actor ?? '',
      changedAt: dto.timestamp ?? '',
    };
  }

  private toPriceBook(dto: PriceBookDto): PriceBook {
    const scope: PriceBookScope = {
      locationId: dto.scope === 'LOCATION' ? (dto.scopeId ?? null) : null,
      customerTierId: dto.scope === 'CUSTOMER_TIER' ? (dto.scopeId ?? null) : null,
      currencyUomId: '',
    };
    return {
      id: dto.priceBookId ?? '',
      name: dto.name ?? '',
      scope,
      effectiveAt: dto.createdAt ?? '',
      endAt: null,
    };
  }

  private toPriceRule(dto: PriceBookRuleDto): PriceRule {
    return {
      id: dto.ruleId ?? '',
      priceBookId: dto.priceBookId ?? '',
      name: '',
      conditionDimension: dto.conditionType ?? '',
      conditionValue: dto.conditionValue ?? '',
      adjustment: parseFloat(dto.pricingLogic ?? '0'),
      adjustmentType: 'FIXED',
      priority: dto.priority ?? 0,
      effectiveAt: dto.effectiveStartAt ?? '',
      endAt: dto.effectiveEndAt ?? null,
      active: dto.status === 'ACTIVE',
    };
  }

  private toMsrp(dto: ProductMsrpDto): Msrp {
    return {
      id: dto.msrpId ?? '',
      productSku: dto.productId ?? '',
      amount: parseFloat(dto.amount ?? '0'),
      currency: dto.currency ?? '',
      effectiveAt: dto.effectiveStartDate ?? '',
      endAt: dto.effectiveEndDate ?? null,
    };
  }

  private toLocationPriceOverride(dto: LocationPriceOverrideResponseDto): LocationPriceOverride {
    return {
      id: dto.overrideId ?? '',
      locationId: dto.locationId ?? '',
      productSku: dto.productId ?? '',
      overridePrice: dto.overridePrice ?? 0,
      currency: '',
      status: (dto.status ?? 'PENDING_APPROVAL') as LocationPriceOverrideStatus,
      reason: '',
      requestedAt: dto.createdAt,
      approvedAt: dto.approvedAt ?? null,
    };
  }

  private toEffectiveLocationPrice(dto: EffectiveLocationPriceResponseDto): EffectiveLocationPrice {
    return {
      locationId: dto.locationId ?? '',
      productSku: dto.productId ?? '',
      basePrice: dto.basePrice ?? 0,
      overridePrice: dto.overrideStatus != null ? (dto.effectivePrice ?? null) : null,
      finalPrice: dto.effectivePrice ?? 0,
      currency: '',
    };
  }

  private guardrailFromOverrideResponse(
    _dto: LocationPriceOverrideResponseDto,
    original: GuardrailPolicy,
  ): GuardrailPolicy {
    // The SDK returns LocationPriceOverrideResponseDto for this endpoint (swagger mismatch).
    // Echo back the original policy values so the caller's model stays consistent.
    return { ...original };
  }

  // =========================================================================
  // Private converters — local models → SDK request DTOs
  // =========================================================================

  private toCreateProductRequest(product: Partial<Product>): ProductCreateRequestDto {
    return {
      name: product.name ?? '',
      description: product.description ?? '',
      unitOfMeasure: '',
      sku: product.sku ?? '',
      mpn: '',
    };
  }

  private toUpdateProductRequest(update: Partial<Product>): ProductUpdateRequestDto {
    return {
      name: update.name ?? '',
      description: update.description ?? '',
      unitOfMeasure: '',
      mpn: '',
    };
  }

  private toLifecycleUpdateRequest(transition: LifecycleStateTransition): ProductLifecycleUpdateRequest {
    return {
      lifecycleState: transition.targetState as ProductLifecycleUpdateRequest['lifecycleState'],
      effectiveAt: transition.effectiveAt,
      overrideReason: transition.overrideReason,
    };
  }

  private toReplacementRequest(replacement: Partial<ReplacementProduct>): ProductReplacementRequest {
    return {
      replacementProductId: replacement.replacementProductId as string,
      priorityOrder: replacement.priority,
      notes: replacement.notes,
      effectiveAt: replacement.effectiveAt,
    };
  }

  private toUomCreateRequest(conversion: Partial<UomConversion>): UomConversionCreateRequestDto {
    return {
      fromUomCode: conversion.fromUom ?? '',
      toUomCode: conversion.toUom ?? '',
      conversionFactor: conversion.conversionFactor ?? 1,
    };
  }




  private toPriceBookCreateRequest(priceBook: Partial<PriceBook>): PriceBookCreateRequestDto {
    let scope: PriceBookCreateRequestDtoScopeEnum = PriceBookCreateRequestDtoScopeEnum.CompanyDefault;
    let scopeId: string | undefined;
    if (priceBook.scope?.locationId) {
      scope = PriceBookCreateRequestDtoScopeEnum.Location;
      scopeId = priceBook.scope.locationId;
    } else if (priceBook.scope?.customerTierId) {
      scope = PriceBookCreateRequestDtoScopeEnum.CustomerTier;
      scopeId = priceBook.scope.customerTierId;
    }
    return {
      name: priceBook.name ?? '',
      scope,
      scopeId,
    };
  }

  private toPriceRuleCreateRequest(rule: Partial<PriceRule>): PriceBookRuleCreateRequestDto {
    const conditionTypeValue = rule.conditionDimension as string | undefined;
    const conditionType = Object.values(PriceBookRuleCreateRequestDtoConditionTypeEnum).includes(
      conditionTypeValue as PriceBookRuleCreateRequestDtoConditionTypeEnum,
    )
      ? (conditionTypeValue as PriceBookRuleCreateRequestDtoConditionTypeEnum)
      : undefined;
    return {
      targetType: PriceBookRuleCreateRequestDtoTargetTypeEnum.Sku,
      pricingLogic: rule.adjustment?.toString() ?? '0',
      conditionType,
      conditionValue: rule.conditionValue,
      priority: rule.priority,
      effectiveStartAt: rule.effectiveAt ?? new Date().toISOString(),
      effectiveEndAt: rule.endAt ?? undefined,
      createdByUserId: '',
    };
  }

  private toCreateMsrpRequest(msrp: Partial<Msrp>): CreateMsrpRequestDto {
    return {
      amount: msrp.amount ?? 0,
      currency: msrp.currency ?? '',
      effectiveStartDate: msrp.effectiveAt ?? '',
      effectiveEndDate: msrp.endAt ?? undefined,
      createdByUserId: '',
    };
  }

  private toUpdateMsrpRequest(update: Partial<Msrp>): UpdateMsrpRequestDto {
    return {
      amount: update.amount ?? 0,
      currency: update.currency ?? '',
      effectiveStartDate: update.effectiveAt ?? '',
      effectiveEndDate: update.endAt ?? undefined,
      createdByUserId: '',
    };
  }

  private toLocationOverrideCreateRequest(
    override: Partial<LocationPriceOverride>,
  ): LocationPriceOverrideCreateRequestDto {
    return {
      locationId: override.locationId ?? '',
      productId: override.productSku ?? '',
      basePrice: 0,
      overridePrice: override.overridePrice ?? 0,
      createdByUserId: '',
    };
  }

  private toGuardrailUpsertRequest(policy: GuardrailPolicy): GuardrailPolicyUpsertRequestDto {
    return {
      scopeId: policy.locationId,
      minMarginPercent: policy.minPricePercent,
      maxDiscountPercent: policy.maxPricePercent,
      autoApprovalThresholdPercent: policy.requiresApprovalAbovePercent,
    };
  }
}
