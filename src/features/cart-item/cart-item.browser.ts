import { demoRemoveCartItem } from './cart-item.api';
import { removeCartItem } from './cart-item.service';
import type { CartItemRemoveHandler, CartItemRemovedDetail, DemoRemovalOutcome } from './cart-item.types';

// To connect a real cart, pass its handler here in CartItem.astro's script and use removalMode="external".
export function initCartItems(removeHandler?: CartItemRemoveHandler, root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-cart-item]').forEach((element) => {
    if (element.dataset.managed === 'true' && root === document) return;
    if (element.dataset.enhanced === 'true') return;
    const button = element.querySelector<HTMLButtonElement>('[data-remove-cart-item]')!;
    const status = element.querySelector<HTMLElement>('[role="status"]')!;
    const itemId = element.dataset.itemId!;
    const removeLabel = button.getAttribute('aria-label')!;
    const demo = element.dataset.removalMode === 'demo';
    const remove = demo
      ? (id: string) => demoRemoveCartItem(id, element.dataset.demoOutcome as DemoRemovalOutcome)
      : removeHandler;
    let pending = false;
    let uncertain = false;
    element.dataset.enhanced = 'true';
    if (element.dataset.disabled === 'true' || !remove) {
      status.textContent = 'Removal is unavailable right now.';
      return;
    }
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (pending || uncertain) return;
      pending = true;
      element.dataset.state = 'loading';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Removing…';
      button.setAttribute('aria-label', `Removing: ${removeLabel}`);
      status.textContent = 'Removing this item…';
      const result = await removeCartItem(itemId, remove);
      pending = false;
      button.setAttribute('aria-busy', 'false');
      element.dataset.state = result.state;
      if (result.state === 'removed') {
        const nextControl = element.parentElement?.querySelector<HTMLButtonElement>('[data-cart-item]:not([data-state="removed"]) [data-remove-cart-item]:not(:disabled)');
        element.dispatchEvent(new CustomEvent<CartItemRemovedDetail>('cartitemremoved', {
          bubbles: true, detail: { itemId },
        }));
        element.remove();
        nextControl?.focus();
      } else {
        uncertain = result.state === 'uncertain';
        button.disabled = uncertain;
        button.textContent = uncertain ? 'Check cart' : 'Try again';
        button.setAttribute('aria-label', `${button.textContent}: ${removeLabel}`);
        status.textContent = result.message;
      }
    });
  });
}
