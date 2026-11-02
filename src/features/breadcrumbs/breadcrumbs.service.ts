import type { BreadcrumbItemData, BreadcrumbsData, BreadcrumbsInput } from './breadcrumbs.types';

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Breadcrumb labels must contain text.');
  return value.trim();
}

function navigationHref(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Each breadcrumb ancestor needs a navigation URL.');
  const href = value.trim();
  // A base is needed only to validate relative references; the supplied URL is preserved.
  const url = new URL(href, 'https://navigation.invalid/');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Breadcrumb links must be HTTP(S) navigation references without credentials.');
  }
  return href;
}

export function prepareBreadcrumbs(input: BreadcrumbsInput | null): BreadcrumbsData {
  if (input === null) return { items: [] };
  if (typeof input !== 'object' || !Array.isArray(input.ancestors)) {
    throw new TypeError('Breadcrumb data must supply ancestors and a current page label.');
  }
  const ancestors: BreadcrumbItemData[] = input.ancestors.map(ancestor => {
    if (typeof ancestor !== 'object' || ancestor === null) throw new TypeError('Invalid breadcrumb ancestor.');
    return { label: text(ancestor.label), href: navigationHref(ancestor.href), current: false };
  });
  return { items: [...ancestors, { label: text(input.currentPage), current: true }] };
}
