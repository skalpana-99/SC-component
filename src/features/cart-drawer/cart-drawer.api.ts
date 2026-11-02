import type { CartDrawerRequest, CartDrawerResponse } from './cart-drawer.types';

export async function requestDrawerView(input: CartDrawerRequest, fetcher: typeof fetch = fetch): Promise<CartDrawerResponse> {
  const response = await fetcher('/api/cart/drawer-view', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/html' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('We couldn’t refresh your basket. Please try again.');
  const document = new DOMParser().parseFromString(await response.text(), 'text/html');
  const views = document.querySelectorAll<HTMLElement>('[data-cart-view]');
  const view = views[0];
  if (views.length !== 1 || !view || !/^\d+$/.test(view.dataset.itemCount ?? '')
    || !Number.isSafeInteger(Number(view.dataset.itemCount))) throw new Error('We couldn’t read your basket. Please try again.');
  // Astro renders and escapes the component markup. Enhancement is explicit after insertion.
  view.querySelectorAll('script').forEach(script => script.remove());
  return { element: view, itemCount: Number(view.dataset.itemCount) };
}
