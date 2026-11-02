# RelatedProducts

Present a supplied set of existing product cards. Open `/related-products` for the local demo and `/related-products?source=catalog` to choose products from the configured catalogue. Empty, failure and card edge-case examples are linked on the page.

## Structure

```text
related-products.types.ts    Supplied selection, prepared data and presentation props
related-products.service.ts  Resolve ordered IDs against already prepared product cards
RelatedProducts.astro        Section heading, responsive grid, ProductCards and empty state
related-products.demo.json   Explicit sample selection of storefront_uid values
```

The existing `products.api.ts` loads and validates `/catalog`; `products.service.ts` filters `listed:true`, formats catalogue prices, maps stock labels and resolves supplementary images. This feature reuses those layers instead of creating another catalogue API wrapper. It needs no browser module or frontend framework.

## Copy and use

Copy this feature folder together with its `../products/` dependency and the product images it uses. For a server-rendered page:

```astro
---
import RelatedProducts from '../features/related-products/RelatedProducts.astro';
import { prepareRelatedProducts } from '../features/related-products/related-products.service';
import { readProductsConfig } from '../features/products/products.api';
import { getProductCards } from '../features/products/products.service';
import type { RelatedProductsSelection } from '../features/related-products/related-products.types';

// Supply real IDs from your page or an agreed editorial/relationship source.
const selection: RelatedProductsSelection = {
  productIds: ['supplied-related-product-id'],
  currentProductId: 'supplied-current-product-id',
};
const cards = await getProductCards(readProductsConfig(process.env));
const data = prepareRelatedProducts(cards, selection);
---
<RelatedProducts id="product-related" data={data} heading="Related products" />
```

Handle catalogue/preparation failures in the calling page, as the demo does. Load the catalogue once and reuse `cards` if the page already needs product cards elsewhere. Never fetch per card or per related section. `prepareRelatedProducts` is synchronous and makes no requests. Import shared contracts directly from their feature types files.

Use a unique `id` per instance for its labelled section. The default heading is “Related products”. The section owns its grid; the individual card owns its own presentation. ProductCard now accepts an optional `headingLevel` of `h2` or `h3`: existing pages retain the `h2` default, while RelatedProducts uses `h3` below its `h2` section heading. Cards retain the existing image placeholder, low-stock and comparison-price rules. There are no invented product-detail links, cart actions or carousel controls.

## Selection contract

`productIds` is an explicitly supplied ordered array of `storefront_uid` values. It is not a commerce response field. IDs are matched exactly; duplicate references appear once, preserving their first position. The optional `currentProductId` is excluded. Unknown or no-longer-listed products are omitted because they have no eligible prepared card. Missing selection is an error; an explicit empty array yields an empty state. The service does not fill gaps with arbitrary catalogue products, impose a count limit or infer a relationship from titles, prices or stock.

Pass cards prepared by `getProductCards`, which owns listing eligibility. The related-product service trusts the prepared model and does not reinterpret raw commerce fields. The current `/catalog` contract supplies no related-product field or recommendation endpoint. A future CMS or recommendation adapter should load and validate its documented relationship data server-side, then supply the IDs before this selection step. Confirm ranking and selection rules with that source.

## Demo and configured data

- `/related-products` explicitly uses the existing catalogue fixture through the product data-layer interface, plus the separate local selection fixture. It does not change `.env` or pretend to be live.
- `?example=edges` demonstrates a long title, missing image and absent comparison price. `?example=empty` supplies no related IDs. `?example=error` deliberately simulates catalogue failure and responds with HTTP 503.
- `?source=catalog` uses the existing `PRODUCTS_DATA_MODE` and `COMMERCE_API_BASE_URL` configuration. No new environment variables are needed. With no selection, it shows the empty state and a demo-only native checkbox form for choosing available listed products.
- Repeated `product` query parameters supply selected IDs in URL order. Optional `current` supplies the current product ID. These are preview controls, not a recommendation API. The native form and cards work without JavaScript.
- Live catalogue requests happen at request time with the existing Node adapter. Errors produce a separate error state; they never substitute fixture cards. The active source/mode is labelled outside the component, and upstream configuration stays server-side.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:related-browser
npm run test:browser
```

Verified on 2026-10-29: Astro checks (zero errors/warnings/hints), production build and all 64 unit tests passed. Twelve RelatedProducts browser checks and all 19 original product-card browser checks passed. They cover three/two/one-column layouts, long titles, missing images/comparisons, prices, stock labels, semantic headings, native selection, JavaScript disabled, one catalogue read per page, supplied ordering and exclusions, empty/error states and live HTTP/invalid-response failures without fallback. Automated live-mode browser checks use an isolated commerce stub. The running production preview also successfully read the configured live catalogue and rendered one explicitly selected product. No recommendation source or relationship API was tested. Screenshots/results are under `artifacts/related-products-*`.
