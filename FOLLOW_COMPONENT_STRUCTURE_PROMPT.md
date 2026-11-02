# Prompt: follow the existing Astro component structure

Copy the prompt below into a new task and fill in the component brief.

---

Build the component described below in the existing Astro app. Implement it and provide a working preview. Follow the coding structure already used for the product component.

## Component brief

- Component name: [name]
- Feature name: [folder/file prefix]
- Required behaviour: [what it should do]
- Visual reference: [screenshot, link, or description]
- Data source and contract: [documented endpoint or local data; write “none” if unnecessary]
- Demo data and edge cases: [examples]
- Out of scope: [excluded behaviour]

## Existing implementation to follow

App folder:

`/Users/kmbandara/Projects/SC-ECOM-CONNECTOR/astor-shared-components`

Before implementing, inspect these existing files:

```text
src/features/products/
  ProductCard.astro
  products.types.ts
  products.api.ts
  products.service.ts
  products.media.ts
  catalog.demo.json

src/pages/index.astro
src/pages/examples.astro
src/layouts/Layout.astro
tests/products.test.ts
```

Use these files as the reference for separation of concerns, naming, imports, validation, service transformations, presentation, and tests. Follow the structure; do not copy product-specific rules into an unrelated feature.

## Structure for the new feature

Keep the new component and its supporting files together:

```text
src/features/<feature>/
  <ComponentName>.astro
  <feature>.types.ts
  <feature>.api.ts          # when an external data source is needed
  <feature>.service.ts      # when selection or transformation is needed
  <feature>.browser.ts      # when browser interactions are needed
  <feature>.media.ts        # when supplementary media mapping is needed
  <feature>.demo.json       # when a demo fixture is needed
```

Do not create empty layers for a presentation-only component. Add only files that have a real responsibility.

### Types

Define the feature's types and interfaces in `<feature>.types.ts`, including consumed API models, configuration types, prepared display models, supplementary media types, and component props as applicable.

Import types directly from that file with `import type`. Do not declare shared types inside the API, service, media mapping, or component. Do not re-export types through implementation files. Keep the types file free of runtime behaviour and data.

The component should import its props using the existing pattern:

```ts
import type { ComponentProps as Props } from './feature.types';
```

Replace `ComponentProps` and `feature` with the actual names. Keep backend response types distinct from the component's prepared display model.

### Data layer

`<feature>.api.ts` owns requests, response validation, and loading fixtures through the same data-layer interface. Use the supplied API contract as the source of truth. Validate fields consumed by this feature and return typed data.

Check HTTP status and any documented success indicator. Keep upstream configuration and credentials server-side. Do not invent endpoints, response fields, or authentication schemes.

For a feature with demo/live modes, make the mode explicit and never silently fall back to demo data after a live failure.

### Service layer

`<feature>.service.ts` owns documented selection rules and transforms validated data into the component's prepared display model. Normalise and format values here. Resolve supplementary media here when needed.

Do not put formatting, business calculations, or raw-response interpretation in the Astro component. Do not create separate services for tiny visual elements or labels.

### Presentation layer

`<ComponentName>.astro` receives prepared data through props and renders semantic markup and scoped styling. It may handle user events and local UI state, while delegating requests and response interpretation to the appropriate API/service modules. It contains no merchant-name conditions or assumptions about raw API structures.

Keep page layout and grids outside the component. Follow the existing app's typography and styling conventions unless the brief supplies a different visual reference.

### Interactive components

For interactive components, add a feature-local browser module when needed. The presentation layer may handle user events and local UI state, while requests and response interpretation remain in the appropriate API/service modules. Keep server-only modules and credentials out of browser imports. Use the existing same-origin proxy where supported by its documented allow-list. Handle loading, failure, and repeated submissions according to the action’s contract. Do not introduce a frontend framework solely for simple interactions.

### Page integration

For initial server-rendered data, call the service at page level and pass its prepared results to the component. For repeated components, load shared data once; do not repeat the same request per item.

Add a clearly identified demonstration route for the new feature. Preserve the existing product pages and the app's selected data mode unless the task explicitly requires changing them. Any separate fixture-only example page must identify itself as demo data.

## Implementation constraints

Keep the code simple, readable, and directly editable. Developers will copy feature folders into independent merchant storefronts and modify them, including through an LLM.

Do not introduce merchant wrappers, a universal component framework, a component registry, a global types registry, a package publishing system, or unrelated backend changes.

Do not invent missing data or business rules. Use deliberate placeholders or omit unsupported content, and document unresolved sources or rules. If live requests are needed, retain request-time server rendering and the existing Astro runtime adapter. Do not make unavailable API requests during the production build.

## Verification and handoff

- Run Astro checks, the production build, and relevant existing tests.
- Add focused tests for meaningful new mapping, validation, or error-handling behaviour.
- Verify the new route, desktop/mobile layouts, and the brief's relevant empty, error, long-content, or missing-content cases.
- Update the README with the new feature's files, usage, configuration, and any contract uncertainties.
- Start or update the preview and finish with its URL, the files added, what was actually verified, and unresolved limitations.

Complete the implementation. Do not stop at a proposal.
