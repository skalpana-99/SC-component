# Astro storefront component starters

Independent, copyable storefront features. The product card is inspired by Comfort Outlet: portrait images, optional low-stock label, title, catalogue price and optional comparison. Product cards ship no browser JavaScript. The quantity stepper uses a small feature-local browser module. Neither feature ships commerce credentials. No cart or product-detail routes are implied by the cards.

## Run

Requires Node >=22.23.4 (verified on Node 24.16.0) and npm.

```sh
npm ci
cp .env.example .env
npm run dev
# http://localhost:4321
npm run check
npm test
npm run build
npm start
# Production Node server: http://localhost:4321
```

`npm run preview` also starts the built server. `HOST` and `PORT` can override its listener. Development and start commands load `.env` with Node's native env-file support; real process environment variables take precedence. Restart after configuration changes.

## Configuration

- `PRODUCTS_DATA_MODE=demo` (default): loads `catalog.demo.json` through the data layer and its validator. No commerce requests.
- `PRODUCTS_DATA_MODE=live`: requires `COMMERCE_API_BASE_URL`, the merchant's server-side origin plus any path prefix. The data layer appends `/catalog`. Set it only after confirming that deployment's contract.
- `/catalog` is documented as public, so no authentication header is invented. If a merchant needs authentication, add it server-side in `products.api.ts` after confirming the scheme. Never use `PUBLIC_` variables for credentials.

Live requests happen at request time with the standalone `@astrojs/node` adapter and `output: 'server'`. Builds do not fetch a catalogue, including when configured live. The same build can run in either mode. Upstream requests time out after eight seconds; HTTP failures, `ok:false`, invalid JSON, invalid current prices and malformed consumed fields return a 503 error page. They never fall back to demo data. The page does not expose upstream bodies or URLs. An empty or entirely unlisted catalogue shows an empty state.

## The three layers

Product types live in `src/features/products/products.types.ts`, alongside the component. The API, service, media mapping, and component import their types directly from this file.

- `src/features/products/products.api.ts`: mode/configuration, one `GET /catalog`, HTTP/envelope validation and a typed projection of fields consumed by this feature. Both modes pass through the same validator. Packs must be an array but their fields, collections, options and variants are not consumed or validated.
- `products.service.ts`: calls the data layer once, selects exactly `listed:true`, normalises valid numeric/string minor units, formats with the supplied currency's fraction digits, maps `band:low` to “Low stock”, and joins supplementary images by `storefront_uid`.
- `ProductCard.astro`: accepts `ProductCardData`, renders semantic markup and scoped card CSS. It knows nothing about merchants, endpoints or raw API structure. Grid and page layout live outside it in `src/layouts/Layout.astro`.

`src/pages/index.astro` calls the service once and passes each prepared item to a card. The explicit `/examples` page always uses an isolated demo fixture for visual inspection of long titles, missing images and missing comparisons; it never claims to show live data. This is a development example that can be removed when copying.

## Contract boundaries and open questions

Source: `../Dose/docs/architecture/commerce-api-endpoint-reference.md`, especially GET `/catalog` and the Catalogue section; also the task's supplied contract. This describes Dose and was not verified against a deployed commerce API. Merchant contracts may differ.

- Only consumed fields are typed. Monetary strings must contain nonnegative integer minor units within JavaScript's safe integer range. Missing or invalid current prices fail validation; real zero is allowed. Unusable optional comparisons are omitted.
- `compare_at_minor` is displayed only when valid and greater than `price_minor`. **Its business meaning and suitability as an original-price comparison still need backend confirmation.** There is no percentage badge or inferred discount rule.
- No minimum variant price, range or “From” label. The supplied catalogue price is displayed as-is. No stock thresholds are derived from `sellable_qty`; only the supplied `band` controls the low-stock label. Other bands do not gain extra UI in this iteration.
- Products without `listed:true` are excluded. No additional purchasability/listing-state filter is invented.
- Currency codes must be supported ISO currencies; amounts use the currency's standard minor-unit exponent (LKR: 2). Confirm deployment-specific currency conventions before live use.
- Images, brand and colour count are not commerce fields. Brand and colour count are omitted. `products.media.ts` holds a separate, replaceable local photo mapping. Unmapped live products get an accessible, intentional placeholder. Add future media/editorial enrichment at that service lookup once a real source is agreed; no Strapi implementation is included.

## Copy and modify

Copy `src/features/products/` into a merchant's Astro app and copy the photos under `public/images/` (or replace the mapping). Import `getProductCards` in a server-rendered listing page, call it once, and pass the results to `ProductCard`. Keep the runtime adapter and server-only configuration. Copy or adapt the grid CSS separately. Change the card markup, styles, model and mapping directly; there is no registry, wrapper or publishing system.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:browser
npm run test:quantity-browser
```

Browser checks require Playwright Chromium (`npx playwright install chromium`) or local Chrome. They launch the built demo server, check desktop/tablet/mobile geometry and images, exercise the edge-case page, and use an isolated local HTTP stub for successful live rendering, empty/unlisted catalogues and live HTTP/envelope/price failures. They also verify a refused network connection and missing live configuration. Screenshots are saved under `artifacts/`. These are simulated integration checks, not evidence of a deployed API connection.

Photo sources and replacement guidance: `public/images/README.md`.

## Quantity stepper

Open `/quantity-stepper` for six explicit local demonstrations. Its limits are supplied by the page and are independent of the product catalogue's demo/live mode. This feature needs no API module, proxy, framework, or backend request.

```text
src/features/quantity-stepper/
  quantity-stepper.types.ts    # input, limits, display data, props and event detail
  quantity-stepper.service.ts  # validate supplied limits and prepare each next state
  QuantityStepper.astro       # markup, initial display and scoped styles
  quantity-stepper.browser.ts # local state, events and DOM updates
```

Copy the feature folder, then prepare data in the consuming page and pass it to the component:

```astro
---
import QuantityStepper from './path/to/quantity-stepper/QuantityStepper.astro';
import { prepareQuantityStepper } from './path/to/quantity-stepper/quantity-stepper.service';

const quantity = prepareQuantityStepper({ value: 1, min: 1, max: 10 });
---
<QuantityStepper id="item-quantity" quantity={quantity} name="quantity" label="Quantity" />
```

- Supply a unique `id` for each instance. `label` defaults to “Quantity”; `name` is optional and enables a hidden form field containing the current value.
- Values and bounds are nonnegative safe integers. Each activation moves by one unit. Zero is permitted when included in the supplied range. Invalid limits or an out-of-range initial value throw an explanatory `RangeError`; they are not silently corrected.
- At either boundary the corresponding button is disabled. Equal limits disable both. Supply `disabled:true` to disable the whole control and omit its named value from form submissions.
- Multiple instances maintain independent state. Native buttons support keyboard activation; the output announces changes. Controls remain disabled until the browser module initializes. Without JavaScript, the initial value and an explanatory message remain visible.
- Each actual step emits a bubbling `quantitychange` event from the component root, with `detail: { value: number }`. The event detail type is `QuantityChangeDetail` in the types file. A surrounding form's reset restores the initial value unless the reset is cancelled.
- This iteration supports buttons, not manual quantity entry. Limits are fixed for each rendered instance. The page must supply limits from its agreed source; the component does not derive stock thresholds, call cart endpoints, or persist quantity. All changes are synchronous, so no request loading or failure state is needed. API persistence would need its own confirmed contract.

`tests/quantity-stepper.test.ts` covers bounds, repeated changes, zero, fixed/disabled states, invalid configuration, immutability and safe integer limits. `npm run test:quantity-browser` starts an isolated built server and verifies real clicks, keyboard activation, emitted events, independent instances, form values/reset, desktop/mobile layouts, long labels, no-JavaScript behaviour and the absence of upstream requests. Screenshots and results are written to `artifacts/quantity-stepper-*`. Run `npm run build` before browser checks.

Quantity stepper verification on 2026-10-29: Astro checks reported zero errors, warnings or hints; all 16 unit tests passed, including the existing product tests. All 10 quantity-stepper browser checks and all 19 existing product browser checks passed against the production build. Desktop and mobile stepper screenshots were visually reviewed. The updated preview served `/quantity-stepper` successfully, and the product catalogue retained its existing live configuration.

## Earlier product-card verification

Verified on 2026-10-29: `astro check` reported no errors/warnings; all 11 focused tests and 19 browser checks passed. The production build succeeded with live mode set to an unreachable endpoint, confirming no build-time catalogue fetch. The built server served both demo routes and local images successfully. Desktop and mobile screenshots were also visually reviewed; see `artifacts/desktop.png`, `artifacts/mobile.png` and `artifacts/verification.json`. No deployed commerce API was contacted. The referenced screenshot was not available among the supplied files, so exact screenshot matching could not be verified; the described visual constraints and the repository's Comfort Outlet reference were used.

## Add to cart button

Open `/add-to-cart`. Cart mode is independent of product catalogue mode:

```env
# Default: explicit simulated success/refusal, no persistent cart changes.
CART_DATA_MODE=demo
# To write to a real commerce cart, set CART_DATA_MODE=live and configure:
COMMERCE_API_BASE_URL=http://127.0.0.1:3001
```

Restart the server after changing mode. Live catalogue/request failures never fall back to demo data. The demo catalogue and simulated cart replies follow the documented response shapes. Variant labels in the example use supplied item codes; the button does not infer size labels or variant IDs.

```text
src/features/add-to-cart/
  add-to-cart.types.ts       # contracts, selection/result models and component props
  add-to-cart.api.ts         # browser-safe same-origin requests and response validation
  add-to-cart.service.ts     # selection validation, example mapping and action outcomes
  add-to-cart.server.api.ts  # server-only catalogue, session and commerce requests
  add-to-cart.browser.ts     # user events, local loading/success/error state
  AddToCartButton.astro      # markup, accessible status and scoped styling
  add-to-cart.demo.json      # documented /catalog fixture for the example page
```

The service prepares catalogue choices once per page. This example selects products explicitly listed and individually purchasable, excluding packs because they need a different payload/flow. Its quantity limits (1-10) are supplied demonstration limits, not stock calculations. The existing product-card selection rules are unchanged.

Copy the feature folder and the route handlers in `src/pages/api/cart/` when adopting this component. Place the button in or associate it with a form using `formId`. Supply these form fields:

- `storefront_uid`: the selected product's documented UUID.
- `qty`: positive whole quantity, such as the named hidden field from `QuantityStepper`.
- `variant`: optional selected variant item code. Set `requiresVariant` when the consuming page knows a choice is required.

```astro
---
import AddToCartButton from './path/to/add-to-cart/AddToCartButton.astro';
---
<form id="product-selection">
  <fieldset data-cart-selection>
    <legend>Selected product</legend>
    <input type="hidden" name="storefront_uid" value={selectedProductUid} />
    <input type="hidden" name="qty" value="1" />
    <!-- Supply a variant field here when the product requires one. -->
  </fieldset>
  <AddToCartButton id="product-add" formId="product-selection" mode="live" />
</form>
```

Use the optional `data-cart-selection` fieldset to freeze selection controls while submitting. Without it, the request still uses a snapshot of the submitted selection. `disabled` explicitly disables the action. IDs must be unique. Buttons are inactive until their browser module initializes, with an explanatory message when JavaScript is unavailable.

The browser submits `{lines:[{storefront_uid,qty,variant?}]}` to the same-origin `POST /api/cart/lines` action. The starter had no existing proxy; this narrow route supports only this action and exposes no arbitrary upstream paths. It requires a matching browser Origin, reads runtime server configuration, opens `POST /sessions` only if there is no cart credential, then calls `POST /carts/:cartId/lines`. Only the cart-scoped credential and public-caller stamp reach commerce; unrelated cookies and internal credentials are not forwarded. The commerce API owns authentication, product/variant eligibility and actual cart writes. No price, stock reservation, checkout or payment logic is added.

Session cookies stay HttpOnly. The local route returns only a validated cart/line confirmation or a sanitised failure, never `cart_token`. The existing `dose_cart` payload provides a cart routing hint using Dose's current cookie format; signature, expiry and ownership checks remain with commerce. This format and the variant item-code convention were confirmed by reading Dose source. Other merchants must verify these conventions before adopting the server adapter. Existing invalid, expired or checked-out carts are reported rather than replaced automatically; a complete cart/session recovery UI is outside this component.

`POST /api/cart/demo-lines` is a separate, explicit, non-persistent simulation. `demoOutcome="error"` selects its variant-refusal example. Demo mode cannot call the live route successfully, and a live failure does not use this simulation.

The button shows loading, confirmed success, and useful refusal messages. Its status uses an accessible live region. An actual success emits a bubbling `cartadded` event with the submitted `CartLine` as `detail`. A successful button becomes “Add again” for an intentional new action. Changing the selection clears the prior success/refusal message.

Repeated submits are ignored while an action is pending. A feature-local request lock also refuses concurrent requests from other buttons on the same page, preventing competing first-cart sessions. The API documents no idempotency key for line creation: there is no automatic retry. A lost/malformed response or upstream 5xx after an add starts is uncertain, not proof that nothing was added; the button asks the shopper to check the cart and stays disabled for that instance. Exactly-once behaviour across reloads/tabs and a cart-review UI would require additional agreed contracts and integration.

Verification commands:

```sh
npm run check
npm test
npm run build
npm run test:cart-browser
```

Verified on 2026-10-29: 28 unit tests passed; product and quantity-stepper browser suites passed; all 14 add-to-cart browser checks passed, including selected quantity/variant, loading, keyboard use, refusals, uncertain outcomes, repeat suppression, HttpOnly cookies, cart reuse, origin checks and desktop/mobile layouts. A fresh local Dose cart also accepted one Guitar (quantity 1) through the built same-origin action. The local Dose catalogue had no eligible variant product, so live variant behaviour was verified with an isolated stub rather than actual Dose variant inventory. Screenshots/results are saved under `artifacts/add-to-cart-*`.

## Cart item

Open `/cart-item` for image/placeholder, selected options, supplied unit price, displayed quantity and removal examples. Types, data, service, supplementary media, presentation and browser behaviour live together under `src/features/cart-item/`. See [the feature README](src/features/cart-item/README.md) for copying instructions, input models and the supplied removal-handler contract.

As explicitly selected for this component, removal is a local asynchronous demo with a supplied-handler integration point. The Commerce API has no documented cart-line update/delete endpoint; no endpoint, zero-quantity delete or cart-rebuild workaround was invented. Quantity is displayed without editing. Existing live catalogue and add-to-cart modes remain unchanged. A real removal handler needs its own confirmed contract.

Verified on 2026-10-29: 34 unit tests, Astro checks (zero errors/warnings/hints), the production build, all 11 cart-item browser checks and all three existing browser suites passed. Desktop/mobile, long titles, missing images/options, string/numeric prices, refusal, lost confirmation, repeated clicks, keyboard/focus and the empty state were checked. No live cart removal was performed. Run `npm run test:cart-item-browser` after a production build; screenshots/results are under `artifacts/cart-item-*`.

## Cart drawer / floating cart

Open `/cart-drawer` for the floating Basket trigger and modal drawer. It reuses `CartItem`, displays supplied unit prices and quote totals, and follows a configured checkout link. See [the drawer README](src/features/cart-drawer/README.md) for its types, API/service layers, cart state, integration and copying instructions.

`CART_DATA_MODE=demo` provides coherent add/remove/empty/error demonstrations with local state. `CART_DATA_MODE=live` reads the existing cart through `POST /carts/:cartId/quote` and catalogue metadata, with no fixture fallback. Configure `CART_CHECKOUT_URL` with your existing checkout path or HTTPS URL to enable live checkout navigation. The demo uses a clearly labelled link-preview page. Live removal remains unavailable under the earlier agreed contract boundary.

Verified: production build, Astro checks, 43 unit tests, all prior browser suites and 21 drawer browser checks. A real local Dose quote was also read successfully. Desktop/mobile screenshots and results are in `artifacts/cart-drawer-*`.

## Order note field

Open `/order-note` to enter, edit, explicitly save or clear a cart's order note. It follows the same feature-local types, API, service, presentation and browser structure. See [the feature README](src/features/order-note/README.md) for copying instructions, the note-only API contract, Unicode rules and event/state behaviour.

`CART_DATA_MODE=demo` simulates saving and resets on reload. Live mode preloads and saves only the current cart's note through server-side adapters for the documented `/carts/:cartId/contact` actions. It requires an existing cart, never sends contact/address/opt-in fields, and never falls back to a fixture after failure. Newer edits made during a save stay in the textarea.

Verified: production build, Astro checks, 52 unit tests, all six browser suites, and real local Dose save/read-back/clear operations on a fresh cart. Results/screenshots are under `artifacts/order-note-*`.

## Breadcrumbs

Open `/breadcrumbs` for supplied navigation hierarchies, long labels, a single current page and absent-data examples. The checkout-link preview at `/cart-drawer/checkout` also uses the component with working parent links. See [the feature README](src/features/breadcrumbs/README.md) for copying instructions and the explicit page-data contract.

Types, preparation logic and presentation live separately under `src/features/breadcrumbs/`. The calling page supplies ancestors and its current label; the component uses native links, an accessible current-page marker and responsive text wrapping. It needs no API, credentials or browser script.

Verified: production build, Astro checks, 57 unit tests, nine breadcrumb browser checks and 21 existing drawer browser checks. Desktop/mobile screenshots and results are under `artifacts/breadcrumbs-*`. Run `npm run test:breadcrumbs-browser` after building.

## Accordion / FAQ

Open `/accordion` for expandable questions and answers, long content and plain-text examples. The page also links to empty and invalid-content states. See [the feature README](src/features/accordion/README.md) for copying instructions and the CMS integration boundary.

Separate types, preparation logic, presentation and a local editorial fixture live under `src/features/accordion/`. Native disclosures support independent open/close state, keyboard navigation and operation without JavaScript. The current content is explicitly demo-only plain text; no CMS endpoint or rich-text rendering contract is assumed. A future server-side CMS loader connects before the service, with credentials kept outside browser imports.

Verified: production build/startup, Astro checks, 60 unit tests and 11 accordion browser checks, including desktop/mobile, keyboard accessibility, repeated toggles, missing answers and JavaScript disabled. Screenshots/results are under `artifacts/accordion-*`. Run `npm run test:accordion-browser` after building. No live CMS connection was tested.

## Related products

Open `/related-products` for an explicit local selection of the existing product cards, plus empty, failure and card edge-case examples. Open `/related-products?source=catalog` to choose products from the configured catalogue. See [the feature README](src/features/related-products/README.md) for copying instructions and the selection contract.

Types, ordered-ID selection, presentation and a sample selection fixture live under `src/features/related-products/`. Catalogue requests and card preparation reuse the existing products API/service once per page. No recommendation source is assumed: the caller supplies related IDs, and unavailable/unlisted, duplicate and optional current-product references are excluded. The configured example uses the existing product mode without changing `.env` or falling back after a live failure.

Verified: Astro checks, production build/startup, 64 unit tests, 12 RelatedProducts browser checks and 19 product-card regression checks. Automated live-mode request/failure checks use an isolated stub; the running preview also successfully read the configured live catalogue and displayed an explicitly selected product. Desktop/tablet/mobile screenshots and results are under `artifacts/related-products-*`. Run `npm run test:related-browser` after building.
