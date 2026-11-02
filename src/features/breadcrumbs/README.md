# Breadcrumbs

Display an explicitly supplied page hierarchy with native ancestor links and a non-linked current page. Open `/breadcrumbs` for examples; `/cart-drawer/checkout` also uses the component with its actual parent links.

## Structure

```text
breadcrumbs.types.ts    Navigation input, prepared model and presentation props
breadcrumbs.service.ts Validate supplied labels/links and prepare the ordered hierarchy
Breadcrumbs.astro      Semantic navigation markup and responsive styling
```

No endpoint or browser module is needed. Page/navigation data is supplied by the calling page. A future navigation API or CMS adapter would load that data before calling `prepareBreadcrumbs`; requests and response interpretation belong outside the component.

## Copy and use

Copy this feature folder and adjust the imports in your page:

```astro
---
import Breadcrumbs from '../features/breadcrumbs/Breadcrumbs.astro';
import { prepareBreadcrumbs } from '../features/breadcrumbs/breadcrumbs.service';

const breadcrumbs = prepareBreadcrumbs({
  ancestors: [
    { label: 'Home', href: '/' },
    { label: 'Clothing', href: '/clothing' },
  ],
  currentPage: 'Track Jacket',
});
---
<Breadcrumbs breadcrumbs={breadcrumbs} />
```

Use routes and labels that exist in your merchant project; the Clothing example above does not create a route. Import shared contracts directly from `breadcrumbs.types.ts` when needed. Keep placement and surrounding page spacing in the calling page.

Supply ancestors in navigation order and the current page label separately. The service appends exactly one current item. It does not infer ancestry from URL segments, insert Home, or invent missing page titles. Labels support Unicode and render as escaped text. Root pages use `ancestors: []`; explicit `null` produces an empty model, and the presentation renders nothing. Malformed supplied data throws a `TypeError` so the page can handle a navigation-source failure according to its own contract.

Links accept relative references and HTTP(S) URLs without embedded credentials. Validation preserves the supplied path, query and fragment; it does not confirm destination availability. Pass trusted page/navigation data. Configure any merchant-specific destination restrictions in the service.

The default navigation label is “Breadcrumb”. Supply `label="Product breadcrumb"` or another distinct accessible name when multiple navigation landmarks need distinguishing. Ancestors are native keyboard-accessible links; the current item uses `aria-current="page"`. Separators are hidden from assistive technology. Long labels wrap, including unbroken text, without truncation. Everything works without JavaScript.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:breadcrumbs-browser
npm run test:drawer-browser
```

Verified on 2026-10-29: Astro checks and production build passed, all 57 unit tests passed, and nine breadcrumb browser checks plus 21 existing drawer checks passed. Checks cover supplied order, root/absent data, invalid labels/links, semantic markup, keyboard navigation, working parent links, JavaScript disabled, desktop and 390px/320px mobile layouts. Screenshots/results are under `artifacts/breadcrumbs-*`.
