import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { TreadDesignUnmatchedPageComponent } from './tread-design-unmatched-page.component';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';

describe('TreadDesignUnmatchedPageComponent', () => {
  let fixture: ComponentFixture<TreadDesignUnmatchedPageComponent>;
  let component: TreadDesignUnmatchedPageComponent;

  const mockService = {
    listUnmatched: vi.fn(),
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TreadDesignUnmatchedPageComponent, TranslateModule.forRoot()],
      providers: [{ provide: ProductTreadDesignService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(TreadDesignUnmatchedPageComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads page 0 on construction', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    expect(mockService.listUnmatched).toHaveBeenCalledWith(0, 25);
  });

  it('transitions to empty when the page has no items — an ordinary outcome, not an error', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    expect(component.state()).toBe('empty');
  });

  it('transitions to ready with items when the page has results', async () => {
    const item = {
      id: 'td-1',
      brand: 'Acme',
      treadDesign: 'Sierra',
      treadDesign2: null,
      productName: null,
      vehicleType: null,
      seasonality: null,
      supplierRef: 'acme-inc',
      vendorProfileId: null,
      vendorVariantId: null,
      updatedAt: null,
      hasUnresolvedImages: false,
      images: [],
      texts: [],
    };
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [item], page: 0, size: 25, totalElements: 1, totalPages: 1 }),
    );

    await setup();

    expect(component.state()).toBe('ready');
    expect(component.items()).toEqual([item]);
  });

  it('sets state to error before errorKey on failure (ADR-0031)', async () => {
    mockService.listUnmatched.mockReturnValueOnce(throwError(() => new Error('boom')));

    await setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PRODUCT.CATALOG.ENRICHMENT.UNMATCHED.ERROR.LOAD');
  });

  it('nextPage() loads the following page when more pages exist', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [{ id: 'td-1' }], page: 0, size: 25, totalElements: 30, totalPages: 2 }),
    );
    await setup();
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [{ id: 'td-2' }], page: 1, size: 25, totalElements: 30, totalPages: 2 }),
    );

    component.nextPage();

    expect(mockService.listUnmatched).toHaveBeenLastCalledWith(1, 25);
  });

  it('nextPage() does nothing on the last page', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [{ id: 'td-1' }], page: 0, size: 25, totalElements: 1, totalPages: 1 }),
    );
    await setup();
    vi.clearAllMocks();

    component.nextPage();

    expect(mockService.listUnmatched).not.toHaveBeenCalled();
  });

  it('previousPage() does nothing on the first page', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of({ items: [{ id: 'td-1' }], page: 0, size: 25, totalElements: 1, totalPages: 1 }),
    );
    await setup();
    vi.clearAllMocks();

    component.previousPage();

    expect(mockService.listUnmatched).not.toHaveBeenCalled();
  });
});
