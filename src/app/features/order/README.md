# Order Feature (CAP-246)

Implements order-domain scaffolding for stories #254, #255, and #256.

## Scope

- Models: cart, order lines, price overrides, and cancel contracts
- Service: `/v1/orders` cart, line, override, and cancel operations
- Pages:
  - `order-cart` for cart create/add/remove flows, plus (CAP:550 S10) the register checkout:
    a **Customer** panel (shared customer lookup with `excludeHouseAccounts`, and an explicit
    **Walk-in customer** button enabled only when the typed cash and card cover the served grand
    total), a **Payment** panel (Pay now or Charge to customer account), server totals and
    **Check out** (`setCartCustomer`, `checkoutOrder` with a per-attempt `Idempotency-Key`), then
    the hand-off to billing payment capture. Write controls gate on `ORDER_SECTION`
    (`order:order:edit`, `order:order:checkout`, `order:order:charge_on_account`); refusals are
    explained by `classifyCartActionError`. The start form no longer asks for a customer id.
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
