import { LandingPageConfig } from '../../../../shared/landing/landing.models';

/** Product landing configuration consumed by the shared {@link LandingPageComponent}. All direct links. */
export const PRODUCT_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'PRODUCT.LANDING.EYEBROW',
  titleKey: 'PRODUCT.LANDING.TITLE',
  descriptionKey: 'PRODUCT.LANDING.SUBTITLE',
  primaryCta: { labelKey: 'PRODUCT.LANDING.HERO.OPEN_CATALOG', icon: 'inventory_2', route: '/app/product/catalog' },
  secondaryCta: { labelKey: 'PRODUCT.LANDING.HERO.OPEN_PRICE_BOOKS', route: '/app/product/pricing/price-books' },
  sections: [
    {
      titleKey: 'PRODUCT.LANDING.SECTION.CATALOG.TITLE',
      descriptionKey: 'PRODUCT.LANDING.SECTION.CATALOG.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'category',
          titleKey: 'PRODUCT.LANDING.CARD.CATALOG_LIST.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.CATALOG_LIST.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/product/catalog',
        },
      ],
    },
    {
      titleKey: 'PRODUCT.LANDING.SECTION.PRICING.TITLE',
      descriptionKey: 'PRODUCT.LANDING.SECTION.PRICING.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'menu_book',
          titleKey: 'PRODUCT.LANDING.CARD.PRICE_BOOKS.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.PRICE_BOOKS.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/product/pricing/price-books',
        },
        {
          kind: 'direct',
          icon: 'sell',
          titleKey: 'PRODUCT.LANDING.CARD.MSRP.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.MSRP.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/product/pricing/msrp',
        },
        {
          kind: 'direct',
          icon: 'price_change',
          titleKey: 'PRODUCT.LANDING.CARD.LOCATION_OVERRIDES.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.LOCATION_OVERRIDES.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/product/pricing/location-overrides',
        },
      ],
    },
    {
      titleKey: 'PRODUCT.LANDING.SECTION.INVENTORY.TITLE',
      descriptionKey: 'PRODUCT.LANDING.SECTION.INVENTORY.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'inventory',
          titleKey: 'PRODUCT.LANDING.CARD.AVAILABILITY.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.AVAILABILITY.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/product/inventory/availability',
        },
        {
          kind: 'direct',
          icon: 'rss_feed',
          titleKey: 'PRODUCT.LANDING.CARD.FEEDS.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.FEEDS.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.OPEN_PAGE',
          route: '/app/product/inventory/feeds',
        },
      ],
    },
    {
      titleKey: 'PRODUCT.LANDING.SECTION.DATA_IMPORT.TITLE',
      descriptionKey: 'PRODUCT.LANDING.SECTION.DATA_IMPORT.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'upload_file',
          titleKey: 'PRODUCT.LANDING.CARD.IMPORT_CATALOG.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.IMPORT_CATALOG.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/product/bulk-import/catalog',
        },
        {
          kind: 'direct',
          icon: 'upload_file',
          titleKey: 'PRODUCT.LANDING.CARD.IMPORT_PRICE.TITLE',
          descriptionKey: 'PRODUCT.LANDING.CARD.IMPORT_PRICE.DESCRIPTION',
          ctaKey: 'PRODUCT.LANDING.ACTION.IMPORT_DATA',
          ctaIcon: 'upload',
          route: '/app/product/bulk-import/price',
        },
      ],
    },
  ],
};
