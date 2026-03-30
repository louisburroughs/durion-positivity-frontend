# Order Feature (CAP-246)

Implements order-domain scaffolding for stories #254, #255, and #256.

## Scope

- Models: cart, order lines, price overrides, and cancel contracts
- Service: `/v1/orders` cart, line, override, and cancel operations
- Pages:
  - `order-cart` for cart create/add/remove flows
  - `price-override` for override application and override history
  - `order-cancel` for controlled cancellation and reversal visibility
- Routes under the order feature root

## Key Files

- `models/order.models.ts`
- `services/order.service.ts`
- `services/order.service.spec.ts`
- `pages/order-cart/order-cart-page.component.ts`
- `pages/order-cart/order-cart-page.component.spec.ts`
- `pages/price-override/price-override-page.component.ts`
- `pages/price-override/price-override-page.component.spec.ts`
- `pages/order-cancel/order-cancel-page.component.ts`
- `pages/order-cancel/order-cancel-page.component.spec.ts`
- `order.routes.ts`

## Test Command

Run order-domain tests only:

`npx ng test --include="src/app/features/order/**/*.spec.ts" --no-watch`
