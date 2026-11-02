# OrderNoteField

Enter, edit, explicitly save and clear the note attached to the current cart. The backend copies that note to the order when creating it; this component does not edit already-placed orders.

Open `/order-note` for the working example.

## Structure

```text
order-note.types.ts       Feature contracts, data model, props, validation and event types
order-note.api.ts         Browser-safe same-origin save requests and response validation
order-note.server.api.ts  Server-only authenticated note reads and note-only writes
order-note.service.ts     Normalisation, validation, initial display data and save outcomes
OrderNoteField.astro      Label, textarea, help, controls and accessible status
order-note.browser.ts     Draft/saved/pending state and DOM events
order-note.demo.json      Documented note-response fixture
```

Types are imported directly from the feature types file. No frontend framework or universal form infrastructure is used. Cart mode, URL validation and cookie-routing helpers are reused from the existing add-to-cart feature.

## Page usage

```astro
---
import OrderNoteField from './path/to/order-note/OrderNoteField.astro';
import { getOrderNoteField } from './path/to/order-note/order-note.service';
import { loadOrderNote } from './path/to/order-note/order-note.server.api';
import { readCartConfig } from './path/to/add-to-cart/add-to-cart.server.api';
const config = readCartConfig(process.env);
const data = await getOrderNoteField(() => loadOrderNote(config, Astro.request));
Astro.response.headers.set('Cache-Control', 'no-store');
Astro.response.headers.set('Vary', 'Cookie');
---
<OrderNoteField id="checkout-order-note" data={data} mode={config.mode} />
```

Call the service once at page level and pass prepared data through props. Use a unique ID. The optional `label` prop defaults to “Order note (optional)”. Copy the feature folder, same-origin routes under `src/pages/api/cart/`, and the existing cart-helper dependencies when adopting it.

## Modes and API contract

The existing `CART_DATA_MODE` controls this feature. `COMMERCE_API_BASE_URL` is required in live mode; changing runtime configuration requires a restart, not a rebuild. Product catalogue mode stays independent.

- **Demo:** preloads the local fixture. The separate `/api/cart/demo-order-note` route simulates saved/refused/unconfirmed responses and never modifies a real cart. Reloading restores the fixture. The page's demo-result selector is outside the reusable field.
- **Live:** requires an existing authenticated cart. No cart/session is created automatically. Missing carts or failed initial reads disable editing with an explanation, rather than presenting a demo note or an apparently loaded blank field.

Source: `Dose/docs/architecture/commerce-api-endpoint-reference.md`, plus the current `Dose/platform/services/commerce-api/src/order-note.ts`, note-only `/contact` handler in `server.ts`, and `cart-contact.ts` read handler. Verify these conventions before using another merchant deployment.

Saving uses documented `POST /carts/:cartId/contact` with **only** `{ order_note: string | null }`. No email, contact, address, billing or opt-in fields are sent. An empty normalised note becomes explicit `null`, which clears it. Extra fields on the same-origin request are not forwarded.

Preloading uses server-only `GET /carts/:cartId/contact`. That upstream route rejects the public-proxy stamp, so the server calls it with the signed cart-scoped credential and no public stamp, then projects only `order_note` into the field's data. Contact/address/opt-in data is never returned to the browser. The note-only save carries the public-caller stamp as documented. The same-origin `/api/cart/order-note` GET/POST adapter exposes only note results, checks Origin for writes, disables caching, and never exposes upstream URLs or cart tokens. It is not a general contact proxy.

A response must report success, refer to the authenticated cart on the server, and confirm the submitted canonical note before the UI says saved. A legacy schema can return `ok:true` with `order_note:null` despite a non-empty submission; that does not count as confirmation. Invalid JSON, mismatched notes, upstream failures and lost responses retain the draft and never fall back to a fixture.

## Note rules and interaction

The current Dose contract accepts optional plain text up to **500 Unicode code points**, matching the database count. The service applies the source-confirmed normalisation: consistent line endings, tabs to spaces, removal of prohibited controls/direction marks, trimming trailing/outer whitespace and limiting consecutive blank lines. Sinhala joiner/non-joiner characters are preserved. The current backend also refuses the case-insensitive substring `coupon`; the service reflects that rule. These are confirmed Dose rules, not a universal merchant policy, and should be changed only with a new agreed contract.

The counter uses the normalised code-point count. Native HTML `maxlength` is intentionally not used because it counts UTF-16 units and would reject some valid 500-character notes. Overlong notes are refused without truncation. Text is displayed as plain textarea content, never rendered as HTML.

Saving is explicit; typing or blurring does not submit. The Save button is disabled when unchanged, unavailable or already saving. Repeated submits during a request are ignored. The textarea remains editable while a save is pending: the submitted snapshot can become saved without replacing newer local edits. The status then explains that the newer draft remains unsaved. Clearing, pending, validation, server refusal, saved and unconfirmed states are announced through a live region.

There are no automatic retries. A note save assigns a value rather than appending, so an unconfirmed result offers a deliberate retry while keeping the text. The API supplies no revision/ETag conflict contract; cross-tab optimistic locking is not invented. A successful confirmation emits a bubbling `ordernotesaved` event with `detail: { orderNote: string | null }`.

Without JavaScript the existing text is visible, but editing/saving are disabled with a message. No note text is placed in browser storage or logs.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:note-browser
```

Verified on 2026-10-29: production build and Astro checks passed; all 52 unit tests and all six browser suites passed. The 21 note browser checks cover explicit save/edit/clear, in-flight draft preservation, repeated submits, Unicode limits, plain-text rendering, errors/uncertainty, no false success, desktop/mobile layouts, missing carts, server-only read filtering and note-only payloads. The live stub confirmed persistence across reload and preservation of contact/address data. A fresh local Dose cart also successfully saved, read back and cleared a note through the real API. No placed order or other customer's cart was modified. Screenshots/results are under `artifacts/order-note-*`.
