import { requestDrawerView } from './cart-drawer.api';
import { initCartItems } from '../cart-item/cart-item.browser';
import { demoRemoveCartItem } from '../cart-item/cart-item.api';
import type { CartLine } from '../add-to-cart/add-to-cart.types';
import type { CartItemRemoveHandler, DemoRemovalOutcome } from '../cart-item/cart-item.types';
import type { CartDrawerRequest } from './cart-drawer.types';

export function initCartDrawers(): void {
  document.querySelectorAll<HTMLElement>('[data-cart-drawer]').forEach(root => {
    if (root.dataset.enhanced === 'true') return;
    const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
    const close = root.querySelector<HTMLButtonElement>('[data-close-cart]')!;
    const content = root.querySelector<HTMLElement>('[data-drawer-content]')!;
    const status = root.querySelector<HTMLElement>('[data-drawer-status]')!;
    const retry = root.querySelector<HTMLButtonElement>('[data-retry-cart]')!;
    const badges = root.querySelectorAll<HTMLElement>('[data-basket-count]');
    const triggers = [...document.querySelectorAll<HTMLButtonElement>('[data-open-cart]')].filter(button => button.dataset.openCart === dialog.id);
    const demo = root.dataset.mode === 'demo';
    const state: CartDrawerRequest = { scenario: 'populated', removedIds: [], additions: [] };
    let opener: HTMLElement | null = null;
    let previousOverflow = '';
    let pending = false;
    let dirty = false;
    let removing = false;
    let version = 0;
    let requestedVersion = -1;

    const remove: CartItemRemoveHandler | undefined = demo ? async id => {
      if (removing || pending) return { ok: false, message: 'Your basket is updating. Please try again shortly.' };
      removing = true;
      // Checkout stays inactive until the refreshed snapshot confirms the new totals.
      content.querySelector<HTMLAnchorElement>('[data-checkout]')?.setAttribute('inert', '');
      const outcome = (root.dataset.removeOutcome ?? 'success') as DemoRemovalOutcome;
      try {
        const reply = await demoRemoveCartItem(id, outcome);
        if (reply.ok) {
          state.removedIds.push(id);
          version++;
          // Refresh even if closing/reopening replaced the row while its handler was pending.
          void refresh();
        }
        else content.querySelector<HTMLAnchorElement>('[data-checkout]')?.removeAttribute('inert');
        return reply;
      } finally { removing = false; }
    } : undefined;

    async function refresh(): Promise<void> {
      if (pending) { if (version !== requestedVersion) dirty = true; return; }
      pending = true;
      do {
        dirty = false;
        requestedVersion = version;
        if (content.contains(document.activeElement)) close.focus();
        content.inert = true;
        retry.hidden = true;
        status.textContent = 'Loading your basket…';
        try {
          const response = await requestDrawerView(state);
          content.replaceChildren(document.importNode(response.element, true));
          content.hidden = false;
          content.inert = false;
          initCartItems(remove, content);
          badges.forEach(badge => { badge.textContent = String(response.itemCount); badge.hidden = false; });
          status.textContent = response.itemCount === 0 ? 'Your basket is empty.' : 'Basket updated.';
        } catch {
          // Retain the last view, but do not permit checkout with an unconfirmed snapshot.
          status.textContent = 'We couldn’t refresh your basket. Please try again.';
          retry.hidden = false;
        }
      } while (dirty);
      pending = false;
    }

    function open(trigger: HTMLElement): void {
      if (dialog.open) return;
      opener = trigger;
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      dialog.showModal();
      triggers.forEach(button => button.setAttribute('aria-expanded', 'true'));
      void refresh();
    }

    triggers.forEach(button => { button.disabled = false; button.addEventListener('click', () => open(button)); });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]')]
        .filter(control => control.tabIndex >= 0 && !control.closest('[inert], [hidden]') && control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    });
    dialog.addEventListener('close', () => {
      document.documentElement.style.overflow = previousOverflow;
      triggers.forEach(button => button.setAttribute('aria-expanded', 'false'));
      opener?.focus();
    });
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    retry.addEventListener('click', () => { void refresh(); });
    content.addEventListener('cartitemremoved', () => { void refresh(); });
    document.addEventListener('cartadded', event => {
      const source = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-add-to-cart]') : null;
      if (!source || source.dataset.mode !== root.dataset.mode) return;
      if (demo) state.additions.push((event as CustomEvent<CartLine>).detail);
      version++;
      if (dialog.open) void refresh();
      else open(source.querySelector<HTMLElement>('button') ?? triggers[0]);
    });
    document.querySelector<HTMLSelectElement>('[data-drawer-scenario]')?.addEventListener('change', event => {
      if (!demo) return;
      state.scenario = (event.currentTarget as HTMLSelectElement).value as CartDrawerRequest['scenario'];
      version++;
      if (state.scenario !== 'error') { state.additions = []; state.removedIds = []; }
      if (dialog.open) void refresh();
    });
    root.dataset.enhanced = 'true';
  });
}
