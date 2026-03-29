import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  LifecycleStateTransition,
  Product,
  ProductLifecycle,
  ProductSummary,
  ReplacementProduct,
  UomConversion,
} from '../models/product.models';
import {
  CostAuditEntry,
  CostStructure,
  ItemCost,
  StandardCostUpdate,
} from '../models/cost.models';
import {
  ActiveMsrp,
  EffectiveLocationPrice,
  GuardrailPolicy,
  LocationPriceOverride,
  Msrp,
  PriceBook,
  PriceRule,
} from '../models/pricing.models';

@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  constructor(private readonly api: ApiBaseService) {}

  // CAP-165 Product Master
  searchProducts(query: string): Observable<ProductSummary[]> {
    const params = new HttpParams().set('q', query);
    return this.api.get<ProductSummary[]>('/catalog/v1/products', params);
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    return this.api.post<Product>('/catalog/v1/products', product);
  }

  getProductById(productId: string): Observable<Product> {
    return this.api.get<Product>(`/catalog/v1/products/${encodeURIComponent(productId)}`);
  }

  updateProduct(productId: string, update: Partial<Product>): Observable<Product> {
    return this.api.put<Product>(`/catalog/v1/products/${encodeURIComponent(productId)}`, update);
  }

  // CAP-165 Lifecycle
  getProductLifecycle(productId: string): Observable<ProductLifecycle> {
    return this.api.get<ProductLifecycle>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/lifecycle`,
    );
  }

  setLifecycleState(
    productId: string,
    transition: LifecycleStateTransition,
  ): Observable<ProductLifecycle> {
    return this.api.put<ProductLifecycle>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/lifecycle`,
      transition,
    );
  }

  getReplacements(productId: string): Observable<ReplacementProduct[]> {
    return this.api.get<ReplacementProduct[]>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/replacements`,
    );
  }

  addReplacementProduct(
    productId: string,
    replacement: Partial<ReplacementProduct>,
  ): Observable<ReplacementProduct> {
    return this.api.post<ReplacementProduct>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/replacements`,
      replacement,
    );
  }

  // CAP-165 UOM
  listUomConversions(productId: string): Observable<UomConversion[]> {
    return this.api.get<UomConversion[]>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/uom-conversions`,
    );
  }

  createUomConversion(
    productId: string,
    conversion: Partial<UomConversion>,
  ): Observable<UomConversion> {
    return this.api.post<UomConversion>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/uom-conversions`,
      conversion,
    );
  }

  updateUomConversion(
    productId: string,
    conversionId: string,
    update: Partial<UomConversion>,
  ): Observable<UomConversion> {
    return this.api.put<UomConversion>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/uom-conversions/${encodeURIComponent(conversionId)}`,
      update,
    );
  }

  deactivateUomConversion(productId: string, conversionId: string): Observable<void> {
    return this.api.delete<void>(
      `/catalog/v1/products/${encodeURIComponent(productId)}/uom-conversions/${encodeURIComponent(conversionId)}`,
    );
  }

  // CAP-166 Costs
  getItemCosts(itemId: string): Observable<ItemCost> {
    return this.api.get<ItemCost>(`/catalog/v1/items/${encodeURIComponent(itemId)}/costs`);
  }

  listCostStructures(itemId: string): Observable<CostStructure[]> {
    const params = new HttpParams().set('itemId', itemId);
    return this.api.get<CostStructure[]>('/catalog/v1/supplier-costs', params);
  }

  getCostStructure(costStructureId: string): Observable<CostStructure> {
    return this.api.get<CostStructure>(
      `/catalog/v1/supplier-costs/${encodeURIComponent(costStructureId)}`,
    );
  }

  createCostStructure(itemId: string, structure: Partial<CostStructure>): Observable<CostStructure> {
    return this.api.post<CostStructure>('/catalog/v1/supplier-costs', { ...structure, itemId });
  }

  updateCostStructure(
    itemId: string,
    structureId: string,
    update: Partial<CostStructure>,
  ): Observable<CostStructure> {
    return this.api.put<CostStructure>(
      `/catalog/v1/supplier-costs/${encodeURIComponent(structureId)}`,
      update,
    );
  }

  deleteCostStructure(itemId: string, structureId: string): Observable<void> {
    return this.api.delete<void>(
      `/catalog/v1/supplier-costs/${encodeURIComponent(structureId)}`,
    );
  }

  updateStandardCost(itemId: string, update: StandardCostUpdate): Observable<ItemCost> {
    return this.api.put<ItemCost>(
      `/catalog/v1/items/${encodeURIComponent(itemId)}/costs/standard`,
      update,
    );
  }

  getAuditHistory(itemId: string, page?: number): Observable<CostAuditEntry[]> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', String(page));
    }
    return this.api.get<CostAuditEntry[]>(
      `/catalog/v1/items/${encodeURIComponent(itemId)}/costs/audit`,
      params,
    );
  }

  // CAP-167 Pricing
  createPriceBook(priceBook: Partial<PriceBook>): Observable<PriceBook> {
    return this.api.post<PriceBook>('/catalog/v1/price-books', priceBook);
  }

  getPriceBook(priceBookId: string): Observable<PriceBook> {
    return this.api.get<PriceBook>(`/catalog/v1/price-books/${encodeURIComponent(priceBookId)}`);
  }

  updatePriceBook(priceBookId: string, update: Partial<PriceBook>): Observable<PriceBook> {
    return this.api.put<PriceBook>(`/catalog/v1/price-books/${encodeURIComponent(priceBookId)}`, update);
  }

  listRules(priceBookId: string): Observable<PriceRule[]> {
    return this.api.get<PriceRule[]>(
      `/catalog/v1/price-books/${encodeURIComponent(priceBookId)}/rules`,
    );
  }

  createRule(priceBookId: string, rule: Partial<PriceRule>): Observable<PriceRule> {
    return this.api.post<PriceRule>(
      `/catalog/v1/price-books/${encodeURIComponent(priceBookId)}/rules`,
      rule,
    );
  }

  updateRule(priceBookId: string, ruleId: string, update: Partial<PriceRule>): Observable<PriceRule> {
    return this.api.put<PriceRule>(
      `/catalog/v1/price-books/${encodeURIComponent(priceBookId)}/rules/${encodeURIComponent(ruleId)}`,
      update,
    );
  }

  deactivateRule(priceBookId: string, ruleId: string): Observable<void> {
    return this.api.delete<void>(
      `/catalog/v1/price-books/${encodeURIComponent(priceBookId)}/rules/${encodeURIComponent(ruleId)}`,
    );
  }

  listMsrp(productSku: string): Observable<Msrp[]> {
    const params = new HttpParams().set('productSku', productSku);
    return this.api.get<Msrp[]>('/catalog/v1/msrp', params);
  }

  createMsrp(msrp: Partial<Msrp>): Observable<Msrp> {
    return this.api.post<Msrp>('/catalog/v1/msrp', msrp);
  }

  updateMsrp(msrpId: string, update: Partial<Msrp>): Observable<Msrp> {
    return this.api.put<Msrp>(`/catalog/v1/msrp/${encodeURIComponent(msrpId)}`, update);
  }

  getActiveMsrp(productSku: string): Observable<ActiveMsrp | null> {
    const params = new HttpParams().set('productSku', productSku);
    return this.api.get<ActiveMsrp | null>('/catalog/v1/msrp/active', params);
  }

  // CAP-168 Location Overrides
  createLocationPriceOverride(
    override: Partial<LocationPriceOverride>,
  ): Observable<LocationPriceOverride> {
    return this.api.post<LocationPriceOverride>('/catalog/v1/location-price-overrides', override);
  }

  getEffectiveLocationPrice(locationId: string, productSku: string): Observable<EffectiveLocationPrice> {
    const params = new HttpParams().set('locationId', locationId).set('productSku', productSku);
    return this.api.get<EffectiveLocationPrice>(
      '/catalog/v1/location-price-overrides/effective',
      params,
    );
  }

  approveLocationPriceOverride(overrideId: string): Observable<LocationPriceOverride> {
    return this.api.post<LocationPriceOverride>(
      `/catalog/v1/location-price-overrides/${encodeURIComponent(overrideId)}/approve`,
      {},
    );
  }

  rejectLocationPriceOverride(overrideId: string, reason: string): Observable<LocationPriceOverride> {
    return this.api.post<LocationPriceOverride>(
      `/catalog/v1/location-price-overrides/${encodeURIComponent(overrideId)}/reject`,
      { reason },
    );
  }

  upsertLocationGuardrailPolicy(policy: GuardrailPolicy): Observable<GuardrailPolicy> {
    return this.api.put<GuardrailPolicy>('/catalog/v1/location-price-overrides/guardrails', policy);
  }
}
