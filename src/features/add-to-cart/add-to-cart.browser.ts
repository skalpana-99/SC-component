import { addSelectedToCart, selectionFromForm } from './add-to-cart.service';
import type { CartLine, CartMode, CartOutcome, DemoCartOutcome } from './add-to-cart.types';

export function initAddToCartButtons(): void {
  document.querySelectorAll<HTMLElement>('[data-add-to-cart]').forEach((element) => {
    if (element.dataset.enhanced === 'true') return;
    const button = element.querySelector<HTMLButtonElement>('button')!;
    const form = button.form;
    if (!form) return;
    const status = element.querySelector<HTMLElement>('[role="status"]')!;
    const selectionFields = form.querySelector<HTMLFieldSetElement>('[data-cart-selection]');
    const suppliedDisabled = element.dataset.disabled === 'true';
    let pending = false;
    let uncertain = false;

    function render(state: 'idle' | 'loading' | CartOutcome['state'], message = ''): void {
      element.dataset.state = state;
      button.textContent = { idle: 'Add to cart', loading: 'Adding…', success: 'Add again', error: 'Try again', uncertain: 'Check your cart' }[state];
      button.disabled = suppliedDisabled || pending || uncertain;
      button.setAttribute('aria-busy', String(pending));
      status.textContent = message;
    }

    form.addEventListener('submit', async (event) => {
      if (event.submitter && event.submitter !== button) return;
      event.preventDefault();
      if (pending || uncertain || suppliedDisabled) return;
      let line: CartLine;
      try {
        line = selectionFromForm(new FormData(form), element.dataset.requiresVariant === 'true');
      } catch (error) {
        render('error', error instanceof TypeError ? error.message : 'Check your product selection.');
        return;
      }
      pending = true;
      if (selectionFields) selectionFields.disabled = true;
      render('loading', 'Adding your selection to the cart…');
      const outcome = await addSelectedToCart(line, element.dataset.mode as CartMode, element.dataset.demoOutcome as DemoCartOutcome);
      pending = false;
      uncertain = outcome.state === 'uncertain';
      if (selectionFields) selectionFields.disabled = false;
      render(outcome.state, outcome.message);
      if (outcome.state === 'success') element.dispatchEvent(new CustomEvent<CartLine>('cartadded', { bubbles: true, detail: line }));
    });
    const resetStatus = () => { if (!pending && !uncertain) render('idle'); };
    form.addEventListener('change', resetStatus);
    form.addEventListener('quantitychange', resetStatus);
    form.addEventListener('reset', resetStatus);
    element.dataset.enhanced = 'true';
    render('idle');
  });
}
