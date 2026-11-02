# Accordion / FAQ

Expand and collapse supplied editorial content. Open `/accordion` for the demo, `/accordion?example=empty` for empty content, and `/accordion?example=invalid` for a missing-answer error.

## Structure

```text
accordion.types.ts    Supplied content, prepared display model and component props
accordion.service.ts Validate content and prepare titles and answer paragraphs
Accordion.astro      Native disclosures and scoped presentation styles
accordion.demo.json  Explicit local plain-text editorial fixture
```

The page supplies content and calls the service before rendering the component. Types are imported directly from `accordion.types.ts`. Native `<details>` and `<summary>` provide disclosure state, keyboard controls and expanded/collapsed accessibility information, so no browser module or frontend framework is needed.

## Copy and use

Copy the feature folder, then use your approved editorial content:

```astro
---
import Accordion from '../features/accordion/Accordion.astro';
import { prepareAccordion } from '../features/accordion/accordion.service';
import type { FaqContent } from '../features/accordion/accordion.types';

const content: FaqContent = {
  items: [{ question: 'A supplied question?', answer: 'An approved plain-text answer.\n\nA second paragraph.' }],
};
const data = prepareAccordion(content);
---
<section aria-labelledby="faq-heading">
  <h2 id="faq-heading">Frequently asked questions</h2>
  <Accordion data={data} />
</section>
```

Keep section headings, width and surrounding page layout in the caller. Items begin closed and open independently. Multiple component instances do not share state. Mouse, touch, Enter and Space use the browser's native controls; Tab moves between summaries. No requests happen when an item opens.

The service preserves supplied order, trims surrounding whitespace, normalises line endings and splits answers on blank lines. Unicode, single line breaks and long unbroken text are preserved. The presentation renders escaped plain text; HTML in an answer displays literally. An empty items array renders “No questions available yet.” Missing, blank or incorrectly typed questions/answers throw a `TypeError`; the demo page reports HTTP 503 and a recovery link rather than omitting entries or replacing them with fixture content. Handle source errors at the calling page in a real integration.

## CMS integration boundary

No CMS URL, response envelope, publishing filter or authentication contract has been supplied for this app. There is no CMS fetch, live data mode or new environment setting. `accordion.demo.json` is the component's local **plain-text input shape**, not a claimed CMS response. Demo policy answers are instructional samples, not merchant commitments.

The existing Dose schema at `Dose/platform/cms/dose-of-island/src/components/shared/faq-item.json` defines `question` and rich-text `answerHtml`; its parent `blocks/faq.json` defines an items array and optional editorial headings/settings. Those schema files do not establish a fetch contract for this starter. `answerHtml` must not be renamed directly to `answer` or passed to `set:html`.

Once a CMS contract is agreed, add a feature-local `accordion.api.ts` for server-side loading and response validation, with consumed response/configuration types in `accordion.types.ts`. Keep credentials server-only, load the content once at page level and map it to the prepared model in the service. Decide whether to convert rich text to plain text or support a confirmed sanitised rich-text model before changing the presentation. Confirm published-item selection, ordering and empty-answer behaviour with that source. Any future demo/live modes must be explicit and must not substitute fixtures after a live failure.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:accordion-browser
```

Verified on 2026-10-29: Astro checks (zero errors/warnings/hints), the production build and all 60 unit tests passed. Eleven Chrome browser checks cover server-rendered content, repeated toggles, independent items/instances, native accessible disclosure state, keyboard focus and tab order, Unicode and escaped markup, desktop and 390px/320px mobile layouts, empty/invalid content, recovery, and full operation without JavaScript. Screenshots/results are under `artifacts/accordion-*`. No live CMS connection was tested.
