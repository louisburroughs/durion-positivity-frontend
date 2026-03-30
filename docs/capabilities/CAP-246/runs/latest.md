# CAP-246 Run Artifact — Order Domain (Wave I-c)

## Stories
- #254: Create Cart + Add Items
- #255: Price Override
- #256: Cancel Order

## Status: DONE

## Implementation Summary
- `order.models.ts`: 10 interfaces/types (PosOrder, PosOrderLine, PriceOverride, CancelOrderResult, + request types)
- `order.service.ts`: 8 service methods — createCart, getOrder, addItem, updateItemQuantity, removeItem, applyPriceOverride, getOverridesByOrder, cancelOrder
- `order.routes.ts`: 4 lazy routes (cart, cart/:orderId, :orderId/price-override/:lineId, :orderId/cancel)
- 3 page components: order-cart, price-override, order-cancel
- 4 spec files, 17 tests

## ADR Compliance
- ADR-0029: All inputs labeled, role="alert" on errors, table caption + scope, conditional void/refund link
- ADR-0030: All strings via | translate, ORDER.ORDER_STATUS.* + STATUS.PENDING_PAYMENT in all 4 locales
- ADR-0031: invocationCallOrder assertions on all mutation + load error paths
- ADR-0032: All fixtures typed as exact interfaces
- ADR-0033: effect() bodies with onCleanup + { allowSignalWrites: true }
- ADR-0034: Server-generated fields readonly? with @serverGenerated TSDoc
- ADR-0035: All 8 service methods covered with HTTP verb + URL + value assertions

## Verification
- Tests: 17 passed
- Code Review: PASS
- Designer: PASS
