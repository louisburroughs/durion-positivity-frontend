import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { provideProductCatalogSource } from './product-catalog-source.provider';
import { ProductCatalogService } from './product-catalog.service';
import { PRODUCT_CATALOG_SOURCE } from '../../../shared/product-catalog/product-catalog-source.tokens';
import type { ServiceSummary, ProductSummary } from '../models/product.models';
import type { ActiveMsrp } from '../models/pricing.models';

describe('provideProductCatalogSource', () => {
  const stubCatalog = {
    searchServices: vi.fn(),
    searchProducts: vi.fn(),
    getActiveMsrp: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideProductCatalogSource(),
        { provide: ProductCatalogService, useValue: stubCatalog },
      ],
    });
  });

  it('lazily resolves ProductCatalogService and forwards searchServices', async () => {
    const services: ServiceSummary[] = [{ id: 'svc-1', name: 'Brake Inspection', shortDescription: '' }];
    stubCatalog.searchServices.mockReturnValue(of(services));
    const source = TestBed.inject(PRODUCT_CATALOG_SOURCE);

    const result = await firstValueFrom(source.searchServices('brake'));

    expect(result).toEqual(services);
    expect(stubCatalog.searchServices).toHaveBeenCalledWith('brake');
  });

  it('forwards searchProducts', async () => {
    const products: ProductSummary[] = [
      {
        id: 'prod-1',
        sku: 'SKU-1',
        name: 'Oil Filter',
        category: 'filters',
        lifecycleState: 'ACTIVE',
        msrp: 12.5,
        msrpCurrency: 'USD',
        effectiveAt: '2024-01-01',
      },
    ];
    stubCatalog.searchProducts.mockReturnValue(of(products));
    const source = TestBed.inject(PRODUCT_CATALOG_SOURCE);

    const result = await firstValueFrom(source.searchProducts('oil filter'));

    expect(result).toEqual(products);
    expect(stubCatalog.searchProducts).toHaveBeenCalledWith('oil filter');
  });

  it('maps getActiveMsrp to just the amount', async () => {
    const msrp: ActiveMsrp = {
      id: 'msrp-1',
      productSku: 'SKU-1',
      amount: 42.5,
      currency: 'USD',
      effectiveAt: '2024-01-01',
      endAt: null,
      active: true,
    };
    stubCatalog.getActiveMsrp.mockReturnValue(of(msrp));
    const source = TestBed.inject(PRODUCT_CATALOG_SOURCE);

    const amount = await firstValueFrom(source.getActiveMsrpAmount('prod-1'));

    expect(amount).toBe(42.5);
    expect(stubCatalog.getActiveMsrp).toHaveBeenCalledWith('prod-1');
  });

  it('maps a null active MSRP to null', async () => {
    stubCatalog.getActiveMsrp.mockReturnValue(of(null));
    const source = TestBed.inject(PRODUCT_CATALOG_SOURCE);

    const amount = await firstValueFrom(source.getActiveMsrpAmount('prod-1'));

    expect(amount).toBeNull();
  });
});
