# CartDrawer / FloatingCart

A native modal basket drawer with its own floating Basket trigger. It displays cart items, selected options, unit prices, quantities, authoritative totals and a supplied checkout link. It reuses `CartItem` and the existing cart session/API support.

## Files and dependencies

```text
cart-drawer.types.ts       Feature configuration, request, snapshot, quote and props models
cart-drawer.api.ts         Browser-safe same-origin view request and response validation
cart-drawer.server.api.ts  Runtime configuration, authenticated quote/catalogue reads and validation
cart-drawer.service.ts     Quote-to-item mapping, demo state transformations, money formatting and checkout URL validation
cart-drawer.browser.ts     Drawer visibility, local state, focus/scroll handling and refresh coordination
CartDrawer.astro           Modal shell, floating trigger and initial presentation
CartDrawerPanel.astro      Server-rendered cart rows, empty state, totals and checkout link
```

The same-origin `POST /api/cart/drawer-view` Astro route renders the panel with prepared data. The browser replaces that panel and explicitly enhances its cart rows. This reuses the actual `CartItem.astro` markup rather than maintaining a second client-side copy. The parent shell's static imports load the panel/item styles. No frontend framework, component registry or browser-side HTML string templates are added. All dynamic item text is escaped by Astro.

Copy the feature, view route and its `CartItem` dependencies when adopting it. It also depends on the existing cart types and server helpers in `features/add-to-cart/` for runtime mode, base URL and cart-cookie routing hints. Those helpers were exported without changing their behaviour.

## Page usage

Prepare the initial empty presentation without fetching a cart. The hidden panel loads when opened:

```astro
---
import CartDrawer from './path/to/cart-drawer/CartDrawer.astro';
import { readDrawerConfig } from './path/to/cart-drawer/cart-drawer.server.api';
import { prepareDrawer } from './path/to/cart-drawer/cart-drawer.service';
const config = readDrawerConfig(process.env);
const initialView = prepareDrawer({ items: [], totals: null });
---
<CartDrawer id="basket-drawer" mode={config.mode} initialView={initialView} />
```

Use one drawer per page. The supplied ID must be unique. Optional additional native buttons can open it using `data-open-cart="basket-drawer"`, `aria-controls="basket-drawer"`, `aria-haspopup="dialog"` and `aria-expanded="false"`. Start them disabled; the browser module enables them when ready. The component already includes a fixed floating trigger.

Opening a drawer refreshes its snapshot. Confirmed `cartadded` events from the existing `AddToCartButton` open and refresh the matching demo/live drawer. A successful add is not treated as proof of prices or totals: live mode reads a new quote. Events from the other data mode are ignored. The local browser state holds only the current view/request and demo simulation inputs; no cart credentials or live prices are persisted in browser storage.

The dialog supports Close, Escape and desktop backdrop dismissal. Keyboard focus stays inside it, opening focuses Close, and closing restores focus to the opener and restores the previous document overflow style. Rows scroll inside the drawer; the close control stays visible. Layout works at desktop and small mobile widths, including long titles and missing images. Without JavaScript, controls remain disabled with a message.

## Configuration and demo state

```env
CART_DATA_MODE=demo
COMMERCE_API_BASE_URL=http://127.0.0.1:3001
# Optional in live mode: site-relative path or HTTPS URL for your existing checkout.
CART_CHECKOUT_URL=
```

The existing `CART_DATA_MODE` controls cart actions and the drawer together. `PRODUCTS_DATA_MODE` remains independent. Restart after changing runtime configuration; a rebuild is not needed.

At `/cart-drawer`, demo mode begins with the existing cart-item fixture, including images/options, a long title, mixed number/string prices and an unmapped image. Its totals are calculated only for this explicit simulation, in the fixture's common supplied currency, with zero demo tax. These are not merchant tax or stock rules. Confirmed demo removals update the local demo state, then refresh rows/counts/totals. The embedded Performance Tee add form demonstrates `AddToCartButton` and `QuantityStepper` integration. Switching between populated/empty scenarios resets demo changes; selecting the failure scenario retains them. Reloading resets the simulation.

The default demo checkout link goes to `/cart-drawer/checkout`, a clearly labelled destination preview, not a checkout implementation. A supplied `CART_CHECKOUT_URL` takes precedence. Credentials, unsafe schemes, whitespace/backslashes and scheme-relative URLs are rejected. No checkout destination is invented in live mode: if unset, the link is unavailable. The component does not start checkout, claim stock, submit payment or create orders.

## Live cart contract

The reference is `Dose/docs/architecture/commerce-api-endpoint-reference.md`, with the existing Dose storefront's server read path inspected for context:

- Basket contents and totals are read using documented `POST /carts/:cartId/quote`, not an invented `GET /cart` endpoint.
- The existing HttpOnly `dose_cart` credential provides a routing hint. The commerce API verifies its signature/expiry and ownership; no signing keys or cart tokens enter browser imports or returned markup.
- No cart cookie means an empty basket. Reading it does not create a shopper session.
- A refresh makes one quote request and one `GET /catalog` request, never one request per row. The catalogue enriches titles and selected option labels only; displayed unit prices come from the quote's `rate_minor`.
- Net total, tax and total come from `net_total_minor`, `tax_total_minor` and `grand_total_minor`. They are never calculated from catalogue prices, line quantities or extra pack prices. Missing/invalid amounts fail validation rather than becoming zero. Numeric/string minor values and supplied currency exponents are respected.
- Selected option snapshots are used when supplied; otherwise a selected variant is resolved against catalogue option names/values. When unavailable, supplied item/variant codes are shown rather than fabricated descriptions.
- A null quote `line_id` is supported using a display-only `quote-line-<idx>` key. That key is never passed to a live removal action. Pack component quote lines are displayed individually; no additional pack charge is added to totals. A grouped pack UI is outside this component.
- Live removal remains unavailable, preserving the previously agreed boundary: no line-delete contract exists and no cart rebuild is performed. `CartItem` gained an optional `managed` flag and a scoped initializer so the drawer can own demo removal and totals without changing standalone item behaviour. A future agreed removal adapter can replace that supplied handler.

The same-origin view action accepts only POST with a matching browser Origin, uses `Cache-Control: no-store` and varies by Cookie. It exposes no arbitrary upstream paths. Upstream URLs stay server-side. Unrelated cookies and internal credentials are not forwarded.

Requests are coalesced while one is pending. State changes during a read cause one fresh read with the latest state, even if the drawer closes. A removal finishing after close/reopen still updates the current view. Closing never causes a pending response to reopen the dialog. There is no background polling.

During a refresh, the prior view can remain visible but is inert, including checkout. Failures retain it and show a retry action rather than painting an empty cart or falling back to fixtures. No live removal, cart recovery, fulfilment, coupon or checkout business logic is added.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:drawer-browser
```

Verified on 2026-10-29: 43 unit tests, Astro checks, the production build, all four existing browser suites and 21 drawer browser checks passed. Browser coverage includes modal keyboard/focus/scroll behaviour, both triggers, responsive layout, empty/error views, demo add/removal totals, in-flight changes and close/reopen races, checkout configuration, no-JavaScript behaviour and a cookie-authenticated live API stub. One fresh cart was also created through the existing add action against local Dose; the drawer read its real quote successfully, showing one item and the backend-supplied total LKR 300. No real checkout or live removal was tested. Results/screenshots are under `artifacts/cart-drawer-*`.
