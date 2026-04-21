import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

type PageState = 'ready' | 'loading' | 'error';

interface DirectCard {
  readonly kind: 'direct';
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly route: string;
  readonly actionKey: string;
}

interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly cards: readonly DirectCard[];
}

const LANDING_SECTIONS: readonly LandingSection[] = [
  {
    titleKey: 'PRODUCT.LANDING.SECTION.CATALOG.TITLE',
    descriptionKey: 'PRODUCT.LANDING.SECTION.CATALOG.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.CATALOG_LIST.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.CATALOG_LIST.DESCRIPTION',
        route: '/app/product/catalog',
        actionKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'PRODUCT.LANDING.SECTION.PRICING.TITLE',
    descriptionKey: 'PRODUCT.LANDING.SECTION.PRICING.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.PRICE_BOOKS.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.PRICE_BOOKS.DESCRIPTION',
        route: '/app/product/pricing/price-books',
        actionKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.MSRP.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.MSRP.DESCRIPTION',
        route: '/app/product/pricing/msrp',
        actionKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.LOCATION_OVERRIDES.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.LOCATION_OVERRIDES.DESCRIPTION',
        route: '/app/product/pricing/location-overrides',
        actionKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'PRODUCT.LANDING.SECTION.INVENTORY.TITLE',
    descriptionKey: 'PRODUCT.LANDING.SECTION.INVENTORY.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.AVAILABILITY.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.AVAILABILITY.DESCRIPTION',
        route: '/app/product/inventory/availability',
        actionKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
      },
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.FEEDS.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.FEEDS.DESCRIPTION',
        route: '/app/product/inventory/feeds',
        actionKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
      },
    ],
  },
  {
    titleKey: 'PRODUCT.LANDING.SECTION.DATA_IMPORT.TITLE',
    descriptionKey: 'PRODUCT.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
    cards: [
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.IMPORT_CATALOG.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.IMPORT_CATALOG.DESCRIPTION',
        route: '/app/product/bulk-import/catalog',
        actionKey: 'PRODUCT.LANDING.ACTION.IMPORT_DATA',
      },
      {
        kind: 'direct',
        titleKey: 'PRODUCT.LANDING.CARD.IMPORT_PRICE.TITLE',
        descriptionKey: 'PRODUCT.LANDING.CARD.IMPORT_PRICE.DESCRIPTION',
        route: '/app/product/bulk-import/price',
        actionKey: 'PRODUCT.LANDING.ACTION.IMPORT_DATA',
      },
    ],
  },
];

@Component({
  selector: 'app-product-landing-page',
  templateUrl: './product-landing-page.component.html',
  styleUrl: './product-landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
})
export class ProductLandingPageComponent {
  readonly sections = LANDING_SECTIONS;
  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<string | null>(null);

  readonly directLinkCount = LANDING_SECTIONS.flatMap(s => s.cards).length;
  readonly guidedLinkCount = 0;
  readonly totalPageCount = this.directLinkCount;
}
