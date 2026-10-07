# Order Feature (CAP-246)

Implements order-domain scaffolding for stories #254, #255, and #256.

## Scope

- Models: cart, order lines, price overrides, and cancel contracts
- Service: `/v1/orders` cart, line, override, and cancel operations; `RegisterSessionService`
  (`/v1/orders/sessions`) for the drawer session, its movements, the cashier options and the
  manager step-up
- Pages:
  - `order-cart` for cart create/add/remove flows, plus (CAP:550 S10) the register checkout:
    a **Customer** panel (shared customer lookup with `excludeHouseAccounts`, and an explicit
    **Walk-in customer** button enabled only when the typed cash and card cover the served grand
    total), a **Payment** panel (Pay now or Charge to customer account), server totals and
    **Check out** (`setCartCustomer`, `checkoutOrder` with a per-attempt `Idempotency-Key`), then
    the hand-off to billing payment capture. Write controls gate on `ORDER_SECTION`
    (`order:order:edit`, `order:order:checkout`, `order:order:charge_on_account`); refusals are
    explained by `classifyCartActionError`. The start form no longer asks for a customer id.
  - `register-drawer` (CAP:550 S22, `/app/order/drawer`, gate `ORDER_PAGE.drawer` =
    `order:session:view`) for the register's drawer session: its header, the movements table and
    the **Pay out** and **Change the float** actions (`ORDER_SECTION.cashMovement` =
    `order:session:cash_movement`, at the control and in the handler). The actions offer only the
    fixed reasons the cashier options read (`getCashMovementOptions`) allows now; vendor cash on
    delivery stays hidden until that read serves a vendor list (S24). The
    `drawer-movement-dialog` records with a `requestId` (UUIDv7) reused for every retry and the
    manager round trip, and sends the session's stamped `currencyCode`, never a `clerkId`. When the
    server answers `CASH_MOVEMENT_APPROVAL_REQUIRED` (or the reason always needs a manager, as a
    float change does), the manager types their own username and password once; they go to S16's
    step-up (`requestCashMovementApproval`) under the cashier's own session and are emptied as soon
    as it answers. The single-use approval token lives only in the dialog; nothing signs anyone in
    or out and nothing reaches browser storage (AW31). The cart and the drawer share
    `REGISTER_TERMINAL_ID`, and the cart header links to the drawer (**Drawer cash**).
  - `price-override` for override application and override history
  - `order-cancel` for controlled cancellation and reversal visibility
- Routes under the order feature root

## Key Files

- `models/order.models.ts`
- `models/register-drawer.models.ts`
- `services/register-session.service.ts`
- `pages/register-drawer/register-drawer-page.component.ts`
- `components/drawer-movement-dialog/drawer-movement-dialog.component.ts`
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
