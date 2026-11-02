# CartItem

Display a prepared cart item with photography or a placeholder, title, selected options, supplied unit price, displayed quantity and a remove action.

```text
cart-item.types.ts    Input/display models, props and removal handler contract
cart-item.api.ts      Validated local fixture loading and asynchronous demo removal
cart-item.service.ts Display mapping, currency formatting and removal confirmation
cart-item.media.ts   Separate supplementary photography keyed by storefront UID
CartItem.astro       Semantic markup, props and scoped styles
cart-item.browser.ts Local interaction state and supplied-handler integration
cart-item.demo.json  Local application-input examples, not a Commerce API response
```

## Demo usage

```astro
---
import CartItem from './path/to/cart-item/CartItem.astro';
import { getCartItems } from './path/to/cart-item/cart-item.service';
const items = await getCartItems();
---
<section aria-label="Cart items">
  {items.map(item => <CartItem item={item} removalMode="demo" />)}
</section>
```

The `/cart-item` example page calls the service once and demonstrates confirmed removal, refusal, lost confirmation, long titles, missing photography, no selected options and an empty state. Demo removals are asynchronous and local to the current page. Reloading restores the fixture. They never read or modify the live cart, regardless of `CART_DATA_MODE` or `PRODUCTS_DATA_MODE`.

## Data boundaries

`CartItemInput` is the consuming application's adapter input, **not** a new backend response contract. A future cart adapter supplies a stable unique `id`, `storefrontUid`, `title`, `selectedOptions`, `unitPriceMinor`, `currency` and `quantity`. Use the authoritative cart/quote unit rate (such as the documented quote's `rate_minor`), not an assumed catalogue price. Resolve titles and option descriptions from their confirmed sources. Do not assume a quote always supplies a usable line ID.

The data boundary validates consumed values. Prices accept nonnegative safe integer minor units as numbers or numeric strings. Missing or invalid prices fail; a real zero is valid. Currency formatting respects the supplied currency's minor-unit exponent. Quantity is a positive whole number and is displayed without an editing control. No line totals, stock limits, variant calculations or backend fields are invented.

Images are supplementary data resolved in the service through `cart-item.media.ts`, with explicit dimensions and useful alt text. Unmapped items get a deliberate accessible placeholder. Copy the required files from `public/images/` or replace the mapping with your approved media source.

## Connect a removal handler

The Commerce API reference and Dose handlers provide no cart-line update/delete endpoint. `POST /carts/:cartId/lines` adds lines; quantity zero is not a delete contract. The existing Dose storefront works around this by rebuilding a cart, but that approach was explicitly excluded from this component's scope.

When a removal contract is agreed, provide its browser-safe adapter through `CartItemRemoveHandler`. In **CartItem.astro's script**, replace the existing `initCartItems()` call with `initCartItems(yourRemoveHandler)`, importing that handler from your API adapter. Render connected items with `removalMode="external"`. Replace the initialisation call rather than adding a second call after the component has already been enhanced.

The handler receives the exact item key and returns a promise resolving to:

- `{ ok: true, itemId }` only after removal of that exact item is confirmed.
- `{ ok: false, message }` for a definite refusal that may be retried deliberately.
- `{ ok: false, message, uncertain: true }` when the result cannot be confirmed.

Requests and response interpretation belong in the appropriate API/service adapter, not the markup. Use a documented same-origin action and keep server-only configuration and credentials out of browser imports. No live removal route is supplied here because its backend contract is missing. External mode without a handler stays disabled with an explanatory status; it never falls back to demo success. The optional `disabled` prop also disables removal. A supplied external handler does not override explicit demo mode.

The component waits for confirmation before removing its DOM row. Repeated clicks are suppressed while pending. A refusal retains the row, price and quantity. Exceptions, malformed replies or confirmation of a different item are treated as uncertain: the row stays visible and retries are blocked until the consuming application checks/refetches the cart. No automatic retries occur.

Confirmed removal emits a bubbling `cartitemremoved` event with `detail: { itemId }` before removing the row. The parent owns item counts, empty-state rendering and cart totals. The component focuses an available remaining remove button; the demo parent focuses its empty heading when the final item disappears.

Without JavaScript, item details remain visible and removal is disabled with a message. IDs must be unique within the rendered collection; opaque keys are safely encoded for accessibility IDs.

## Verification

Run `npm test`, `npm run check`, `npm run build`, then `npm run test:cart-item-browser` from the app folder. Unit tests cover input validation, prices, options, media and supplied handler results. Browser checks cover responsive layouts, keyboard operation, pending/refusal/uncertain states, repeated clicks, focus, empty state, no-JavaScript behaviour, and absence of live requests. Results and screenshots are in `artifacts/cart-item-*`.

For a parent such as `CartDrawer` that owns cart state, `managed` defers automatic item enhancement. The parent calls `initCartItems(handler, container)` after rendering the rows. Omitting `managed` preserves standalone behaviour. Container queries let the existing item layout adapt inside a narrow drawer even on a desktop viewport.
