# Reusable Astro component prompt

Copy the prompt below into a new task and fill in the brief. Attach the API reference and visual reference that apply to that component.

---

Build a runnable Astro site demonstrating a reusable starter component. Implement it and provide a working preview. Do not stop at a proposal.

## Component brief

- Component name: [for example, ProductCard]
- Feature name: [for example, products]
- App folder: [absolute path to the Astro app]
- Visual reference: [attach a screenshot or provide a reference]
- API reference: [attach the relevant contract]
- Required content and behaviour: [describe what this component must display or do]
- Demo scenarios: [provide representative data and edge cases]
- Out of scope: [list excluded features]

## Goal

We build independent Astro storefronts for different merchants. Developers will copy this starter code into a merchant project and modify it directly, including through an LLM.

Keep the implementation simple and readable. Follow existing repository conventions, or initialise a minimal Astro project if none exists. Do not create merchant wrappers, a universal component framework, a component registry, or a package publishing system.

## Separate responsibilities and types

Keep the component and its supporting files together under `src/features/<feature>/`. Use TypeScript and these responsibilities:

1. `<feature>.types.ts` — types only
   - Define the feature's consumed API models, configuration types, service result models, supplementary media types when needed, and component props here.
   - Keep the API contract types distinct from the prepared presentation models. Supplementary media or editorial fields must not become invented API fields.
   - This file contains type/interface declarations and type-only imports where needed. It contains no fetching, validation, transformation, runtime configuration, fixture data, or styling.
   - The API, service, media mapping, component, and pages import the types they need directly from this file using `import type`.
   - Do not declare shared feature types in the API, service, media mapping, or component files. Do not re-export them through implementation files or create a global types registry.
   - Define the component's props in this file too. An Astro component can import its props as `import type { ProductCardProps as Props } from './products.types';`, substituting the actual feature names.

2. `<feature>.api.ts` — data layer
   - Fetch the documented endpoint from a configurable server-side base URL.
   - Check HTTP status and the documented success indicator, such as `ok`, when the contract defines one.
   - Validate the fields consumed by this feature at the boundary. TypeScript declarations alone are not runtime validation.
   - Return typed data using models imported from `<feature>.types.ts`.
   - Keep credentials and upstream requests out of browser code. Do not invent an authentication scheme.
   - Load demo fixtures through the same interface and validator used for live responses.

3. `<feature>.service.ts` — service layer
   - Apply the feature's documented selection and business rules.
   - Transform validated API data into a small, prepared presentation model defined in `<feature>.types.ts`.
   - Normalise and format values here, including money and display labels when relevant.
   - Resolve supplementary images or editorial content separately from commerce data.
   - Do not create services for individual labels or other tiny visual elements.

4. `<ComponentName>.astro` — presentation layer
   - Receive prepared data through typed props imported from `<feature>.types.ts`.
   - Render semantic markup and styling.
   - Make no endpoint calls and contain no assumptions about raw API response structures.
   - Contain no merchant-name conditions, business-rule calculations, or shared type declarations.
   - Keep page layout and repeated-component grid styling outside the component.

For a list, the page calls the service once and passes prepared data to each component. Do not fetch the same catalogue or stock separately for every rendered item.

For a component that needs no backend data, omit unnecessary API/service files. Keep its props and feature types in the separate types file; do not invent endpoints or empty layers merely to match this structure.

## Backend contract and missing information

Use the supplied API reference as the source of truth. Do not assume an endpoint is reachable or that every merchant deployment has the same contract. Clearly distinguish documented behaviour from anything actually verified against a running API.

Do not invent API fields or business rules to fill gaps. Omit unsupported information and document the source or rule that is still needed. Keep local demo media mappings separate from API models and key them by the documented stable identifier. Use replaceable local images and a deliberate placeholder when a live item has no mapped image. Document where future media or editorial enrichment would connect. Do not implement Strapi or change the commerce backend unless explicitly requested.

For components consuming the documented product catalogue, retain these boundaries:

- `GET /catalog` returns `{ ok: true, products: CatalogProduct[], packs: CatalogPack[], collections?: CatalogCollection[] }`. Consume only the arrays needed by the brief.
- Product listings include only products explicitly marked `listed:true`; the endpoint also returns unlisted products.
- Monetary values may be numbers or JSON strings. Values ending in `_minor` are minor currency units. Use the supplied currency and never silently convert missing or invalid prices to zero.
- Show a comparison price only when `compare_at_minor` is valid and greater than `price_minor`. Its business meaning still needs backend confirmation.
- Display the supplied catalogue price without inventing variant ranges, minimum-price calculations, or “From” labels.
- Stock bands are `out`, `low`, `in_stock`, and `preorder`. Map supplied bands to the required labels; do not derive stock thresholds from `sellable_qty`.
- Images, brand, colour count, and an explicit discount-percentage label are not documented catalogue fields. Omit brand, colour count, and percentage-discount badges until their real sources and rules are supplied.

## Demo and live modes

Provide explicit demo and live modes for features requiring data:

- Demo mode loads a local fixture following the documented endpoint response shape.
- Live mode requests the configured endpoint.
- Never silently fall back to fixtures when a live request fails.
- Make the active mode clear outside the component.
- Provide an `.env.example` with configuration names and no credentials.
- Do not assume an existing base URL belongs to the merchant in the brief. Use demo mode unless a suitable live URL is supplied or already explicitly selected for this task.

Use request-time server rendering with an appropriate Astro runtime adapter for live requests. Do not fetch an unavailable local API during the production build. Read live configuration at runtime so a configuration change can take effect after restarting the server without rebuilding.

## Visual implementation

Follow the supplied visual reference and the brief's content constraints. If the reference is unavailable, state that limitation and follow the available visual instructions without claiming exact matching.

Use semantic markup, useful image alt text, explicit image dimensions, readable typography, and responsive layouts. Use the reference as inspiration; do not render the reference screenshot as the implementation. Keep presentation independent of any particular merchant's identity unless that identity is explicitly supplied as presentation content.

Do not add unrelated storefront features, interactions, or decorative sections. Provide understandable empty and error states when relevant.

## Verification and handoff

Verify the production build and server startup. Inspect desktop and mobile appearance. Exercise the realistic edge cases from the brief, including long text, missing optional content, missing images, empty results, mixed string/numeric monetary values, listing filters, and live failure handling where applicable.

Use focused tests for meaningful mapping, validation, and error-handling boundaries. Run Astro's type checks to verify that all layers and component props correctly import the separate types file. Do not add tests that only mirror trivial implementation details.

Write or update a short README covering run commands, configuration, the separate types file and three implementation layers, known contract uncertainties, and how another developer can copy and modify the feature.

Finish with the working preview URL or available preview mechanism, what was actually verified, and unresolved limitations. Do not claim a live API connection or visual comparison was tested unless it was.
