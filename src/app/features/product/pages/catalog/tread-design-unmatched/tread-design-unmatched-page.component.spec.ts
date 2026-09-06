import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TreadDesignUnmatchedPageComponent } from './tread-design-unmatched-page.component';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';
import type {
  UnmatchedTreadDesign,
  UnmatchedTreadDesignPage,
} from '../../../models/tread-design-enrichment.models';

/** A fully populated `UnmatchedTreadDesign` row; override only the fields a case cares about. */
function buildUnmatchedTreadDesign(overrides: Partial<UnmatchedTreadDesign> = {}): UnmatchedTreadDesign {
  return {
    id: 'td-1',
    brand: null,
    treadDesign: null,
    treadDesign2: null,
    productName: null,
    vehicleType: null,
    seasonality: null,
    supplierRef: null,
    vendorProfileId: null,
    vendorVariantId: null,
    updatedAt: null,
    hasUnresolvedImages: false,
    images: [],
    texts: [],
    matchState: null,
    matchStateAt: null,
    candidates: [],
    ...overrides,
  };
}

/** A worklist page fixture; override only the fields a case cares about. */
function buildUnmatchedPage(overrides: Partial<UnmatchedTreadDesignPage> = {}): UnmatchedTreadDesignPage {
  return {
    items: [],
    page: 0,
    size: 25,
    totalElements: 0,
    totalPages: 0,
    ...overrides,
  };
}

describe('TreadDesignUnmatchedPageComponent', () => {
  let fixture: ComponentFixture<TreadDesignUnmatchedPageComponent>;
  let component: TreadDesignUnmatchedPageComponent;

  const mockService = {
    listUnmatched: vi.fn(),
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TreadDesignUnmatchedPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ProductTreadDesignService, useValue: mockService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TreadDesignUnmatchedPageComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads page 0 with the default UNMATCHED+REVIEW filter on construction', async () => {
    mockService.listUnmatched.mockReturnValueOnce(of(buildUnmatchedPage()));

    await setup();

    expect(mockService.listUnmatched).toHaveBeenCalledWith(
      ['UNMATCHED', 'REVIEW'],
      undefined,
      0,
      25,
    );
  });

  it('transitions to empty when the page has no items — an ordinary outcome, not an error', async () => {
    mockService.listUnmatched.mockReturnValueOnce(of(buildUnmatchedPage()));

    await setup();

    expect(component.state()).toBe('empty');
  });

  it('transitions to ready with items when the page has results', async () => {
    const item: UnmatchedTreadDesign = {
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
      matchState: 'REVIEW',
      matchStateAt: '2026-09-01T00:00:00Z',
      candidates: [],
    };
    mockService.listUnmatched.mockReturnValueOnce(
      of(buildUnmatchedPage({ items: [item], totalElements: 1, totalPages: 1 })),
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

  it('nextPage() loads the following page when more pages exist, keeping the current filter', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of(buildUnmatchedPage({
        items: [buildUnmatchedTreadDesign({ id: 'td-1' })],
        totalElements: 30,
        totalPages: 2,
      })),
    );
    await setup();
    mockService.listUnmatched.mockReturnValueOnce(
      of(buildUnmatchedPage({
        items: [buildUnmatchedTreadDesign({ id: 'td-2' })],
        page: 1,
        totalElements: 30,
        totalPages: 2,
      })),
    );

    component.nextPage();

    expect(mockService.listUnmatched).toHaveBeenLastCalledWith(['UNMATCHED', 'REVIEW'], undefined, 1, 25);
  });

  it('nextPage() does nothing on the last page', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of(buildUnmatchedPage({
        items: [buildUnmatchedTreadDesign({ id: 'td-1' })],
        totalElements: 1,
        totalPages: 1,
      })),
    );
    await setup();
    vi.clearAllMocks();

    component.nextPage();

    expect(mockService.listUnmatched).not.toHaveBeenCalled();
  });

  it('previousPage() does nothing on the first page', async () => {
    mockService.listUnmatched.mockReturnValueOnce(
      of(buildUnmatchedPage({
        items: [buildUnmatchedTreadDesign({ id: 'td-1' })],
        totalElements: 1,
        totalPages: 1,
      })),
    );
    await setup();
    vi.clearAllMocks();

    component.previousPage();

    expect(mockService.listUnmatched).not.toHaveBeenCalled();
  });

  describe('filtering', () => {
    beforeEach(async () => {
      mockService.listUnmatched.mockReturnValueOnce(of(buildUnmatchedPage()));
      await setup();
      vi.clearAllMocks();
    });

    it('toggleMatchState adds a state to the selection', () => {
      component.toggleMatchState('MATCHED', true);

      expect(component.isMatchStateSelected('MATCHED')).toBe(true);
      expect(component.selectedMatchStates()).toEqual(['UNMATCHED', 'REVIEW', 'MATCHED']);
    });

    it('toggleMatchState removes a state from the selection', () => {
      component.toggleMatchState('REVIEW', false);

      expect(component.isMatchStateSelected('REVIEW')).toBe(false);
      expect(component.selectedMatchStates()).toEqual(['UNMATCHED']);
    });

    it('applyFilters() reloads page 0 with the current matchState and vendorProfileId selection', () => {
      component.toggleMatchState('MATCHED', true);
      component.setVendorProfileIdFilter('  vendor-9  ');
      mockService.listUnmatched.mockReturnValueOnce(of(buildUnmatchedPage()));

      component.applyFilters();

      expect(mockService.listUnmatched).toHaveBeenCalledWith(
        ['UNMATCHED', 'REVIEW', 'MATCHED'],
        'vendor-9',
        0,
        25,
      );
    });

    it('clearFilters() resets to the default selection and reloads page 0', () => {
      component.toggleMatchState('MATCHED', true);
      component.setVendorProfileIdFilter('vendor-9');
      mockService.listUnmatched.mockReturnValueOnce(of(buildUnmatchedPage()));

      component.clearFilters();

      expect(component.selectedMatchStates()).toEqual(['UNMATCHED', 'REVIEW']);
      expect(component.vendorProfileIdFilter()).toBe('');
      expect(mockService.listUnmatched).toHaveBeenCalledWith(['UNMATCHED', 'REVIEW'], undefined, 0, 25);
    });
  });
});
