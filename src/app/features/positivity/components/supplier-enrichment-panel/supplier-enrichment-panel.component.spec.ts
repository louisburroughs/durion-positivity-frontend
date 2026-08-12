/**
 * Manufacturer enrichment section for Product Detail (issue #195).
 *
 * The rule under test throughout: a product with no manufacturer content
 * renders *nothing at all* — not an empty section, not a heading, not a
 * placeholder.
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierEnrichmentPanelComponent } from './supplier-enrichment-panel.component';
import { SupplierEnrichmentService } from '../../services/supplier-enrichment.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { SupplierProductEnrichment } from '../../models/supplier-enrichment.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const PRODUCT_ID = 'ffc9a4c2-0000-7000-8000-000000000010';

const enriched: SupplierProductEnrichment = {
  productId: PRODUCT_ID,
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  manufacturerName: 'Michelin',
  descriptions: [
    { locale: 'en-US', value: 'All-season touring tread with reinforced shoulders.' },
    { locale: 'fr-FR', value: 'Bande de roulement toutes saisons à épaules renforcées.' },
  ],
  images: [
    {
      imageId: 'img-1',
      url: 'https://cdn.example.test/tread.webp',
      altText: [
        { locale: 'en-US', value: 'Tread pattern close-up' },
        { locale: 'fr-FR', value: 'Gros plan de la bande de roulement' },
      ],
      role: 'TREAD',
      widthPx: 800,
      heightPx: 600,
    },
  ],
  attributes: [
    {
      code: 'TREAD_PATTERN',
      label: [{ locale: 'en-US', value: 'Tread pattern' }],
      value: [{ locale: 'en-US', value: 'Asymmetric' }],
    },
  ],
  asOf: '2026-08-11T00:00:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 0,
};

describe('SupplierEnrichmentPanelComponent', () => {
  let fixture: ComponentFixture<SupplierEnrichmentPanelComponent>;

  const enrichmentService = { getProductEnrichment: vi.fn(), listUnmatchedEnrichment: vi.fn() };
  const currentLocale = signal<string>('en-US');
  const localeService = { currentLocale };

  beforeEach(async () => {
    currentLocale.set('en-US');
    enrichmentService.getProductEnrichment.mockReturnValue(of(enriched));

    await TestBed.configureTestingModule({
      imports: [SupplierEnrichmentPanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SupplierEnrichmentService, useValue: enrichmentService },
        { provide: LocaleService, useValue: localeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierEnrichmentPanelComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(productId: string | null = PRODUCT_ID): HTMLElement {
    fixture.componentRef.setInput('productId', productId);
    fixture.componentRef.setInput('nowMs', NOW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the enrichment section with description, attributes and images', () => {
    const el = render();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelector('.enrich-panel')).not.toBeNull();
    expect(el.querySelector('.enrich-panel__description p')?.textContent).toContain(
      'All-season touring tread',
    );
    expect(el.querySelector('.enrich-panel__value')?.textContent?.trim()).toBe('Asymmetric');
    expect(el.querySelectorAll('.enrich-panel__image')).toHaveLength(1);
  });

  it('labels the content as manufacturer-provided so it is distinguishable from catalog data', () => {
    const el = render();
    const provenance = el.querySelector('.enrich-panel__provenance');

    expect(provenance).not.toBeNull();
    expect(provenance?.textContent).toContain('POSITIVITY.ENRICHMENT.PROVENANCE');
  });

  it('renders nothing at all when the product has no enrichment', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(of(null));
    const el = render();

    expect(fixture.componentInstance.state()).toBe('absent');
    expect(fixture.componentInstance.visible()).toBe(false);
    expect(el.querySelector('.enrich-panel')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders nothing while loading — no placeholder hole on an unenriched product', () => {
    const pending = new Subject<SupplierProductEnrichment | null>();
    enrichmentService.getProductEnrichment.mockReturnValue(pending.asObservable());
    const el = render();

    expect(fixture.componentInstance.state()).toBe('loading');
    expect(el.textContent?.trim()).toBe('');

    pending.next(enriched);
    pending.complete();
    fixture.detectChanges();

    expect(el.querySelector('.enrich-panel')).not.toBeNull();
  });

  it('renders nothing when a payload arrives carrying no usable content', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      of({ ...enriched, descriptions: [], images: [], attributes: [] }),
    );
    const el = render();

    expect(fixture.componentInstance.hasContent()).toBe(false);
    expect(el.querySelector('.enrich-panel')).toBeNull();
  });

  it('requests nothing while the host page has no product id', () => {
    render(null);

    expect(enrichmentService.getProductEnrichment).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('resolves description and alt text in the user locale', () => {
    currentLocale.set('fr-FR');
    const el = render();

    expect(el.querySelector('.enrich-panel__description p')?.textContent).toContain(
      'Bande de roulement',
    );
    expect(el.querySelector('.enrich-panel__image')?.getAttribute('alt')).toBe(
      'Gros plan de la bande de roulement',
    );
  });

  it('falls back to the same language in another region and says the text is a fallback', () => {
    currentLocale.set('fr-CA');
    const el = render();

    expect(fixture.componentInstance.description()).toContain('Bande de roulement');
    expect(fixture.componentInstance.descriptionIsFallback()).toBe(true);
    expect(el.querySelector('.enrich-panel__note')?.textContent?.trim()).toBe(
      'POSITIVITY.ENRICHMENT.LOCALE_FALLBACK',
    );
  });

  it('falls back to the platform default locale when the language was never published', () => {
    currentLocale.set('es-US');
    render();

    expect(fixture.componentInstance.description()).toContain('All-season touring tread');
    expect(fixture.componentInstance.descriptionIsFallback()).toBe(true);
  });

  it('does not mark text as a fallback when it is in the requested locale', () => {
    const el = render();

    expect(fixture.componentInstance.descriptionIsFallback()).toBe(false);
    expect(el.querySelector('.enrich-panel__note')).toBeNull();
  });

  it('lazy-loads images and takes alt text from enrichment metadata (ADR-0029)', () => {
    const el = render();
    const image = el.querySelector('.enrich-panel__image');

    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('alt')).toBe('Tread pattern close-up');
    expect(image?.getAttribute('src')).toBe('https://cdn.example.test/tread.webp');
  });

  it('drops an image whose alt text resolves to nothing rather than inventing one', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      of({
        ...enriched,
        images: [
          { imageId: 'img-2', url: 'https://cdn.example.test/no-alt.webp', altText: [], role: null },
        ],
      }),
    );
    const el = render();

    expect(fixture.componentInstance.imageViews()).toEqual([]);
    expect(el.querySelector('.enrich-panel__image')).toBeNull();
  });

  it('drops an attribute with no resolvable value instead of showing a blank row', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      of({
        ...enriched,
        attributes: [
          {
            code: 'TREAD_DEPTH',
            label: [{ locale: 'en-US', value: 'Tread depth' }],
            value: [],
          },
        ],
      }),
    );
    render();

    expect(fixture.componentInstance.attributeViews()).toEqual([]);
  });

  it('falls back to the raw attribute code when the manufacturer published no label', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      of({
        ...enriched,
        attributes: [{ code: 'TREAD_DEPTH', label: [], value: [{ locale: 'en-US', value: '8mm' }] }],
      }),
    );
    render();

    expect(fixture.componentInstance.attributeViews()).toEqual([
      { code: 'TREAD_DEPTH', label: 'TREAD_DEPTH', value: '8mm' },
    ]);
  });

  it('separates manufacturer publication time from platform fetch time', () => {
    const el = render();
    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n => n.textContent?.trim());

    expect(terms).toEqual([
      'POSITIVITY.ENRICHMENT.PUBLISHED_AT',
      'POSITIVITY.ENRICHMENT.FETCHED_AT',
    ]);
  });

  it('sets state then errorKey on failure and does not claim the product is unenriched', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('.enrich-panel')).toBeNull();
  });

  it('renders a 403 as a restricted state', () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  it('retries after a failure and recovers', () => {
    enrichmentService.getProductEnrichment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway' })),
    );
    render();
    expect(fixture.componentInstance.state()).toBe('error');

    enrichmentService.getProductEnrichment.mockReturnValue(of(enriched));
    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.errorKey()).toBeNull();
  });

  it('cancels an in-flight read when the product changes (ADR-0033)', () => {
    const pending = new Subject<SupplierProductEnrichment | null>();
    enrichmentService.getProductEnrichment.mockReturnValueOnce(pending.asObservable());
    render();
    expect(pending.observed).toBe(true);

    enrichmentService.getProductEnrichment.mockReturnValue(of(enriched));
    fixture.componentRef.setInput('productId', 'ffc9a4c2-0000-7000-8000-000000000099');
    fixture.detectChanges();

    expect(pending.observed).toBe(false);
  });
});
