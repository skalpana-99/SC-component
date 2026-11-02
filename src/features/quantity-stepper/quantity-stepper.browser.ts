import { prepareQuantityStepper, stepQuantity } from './quantity-stepper.service';
import type { QuantityChangeDetail } from './quantity-stepper.types';

export function initQuantitySteppers(): void {
  document.querySelectorAll<HTMLElement>('[data-quantity-stepper]').forEach((element) => {
    if (element.dataset.enhanced === 'true') return;

    const initialQuantity = prepareQuantityStepper({
      value: Number(element.dataset.value),
      min: Number(element.dataset.min),
      max: Number(element.dataset.max),
      disabled: element.dataset.disabled === 'true',
    });
    let quantity = initialQuantity;
    const decrease = element.querySelector<HTMLButtonElement>('[data-action="decrease"]')!;
    const increase = element.querySelector<HTMLButtonElement>('[data-action="increase"]')!;
    const output = element.querySelector<HTMLOutputElement>('output')!;
    const input = element.querySelector<HTMLInputElement>('input[type="hidden"]');

    function render(): void {
      output.value = String(quantity.value);
      if (input) input.value = String(quantity.value);
      element.dataset.value = String(quantity.value);
      decrease.disabled = !quantity.canDecrease;
      increase.disabled = !quantity.canIncrease;
    }

    function change(direction: -1 | 1): void {
      const next = stepQuantity(quantity, direction);
      if (next.value === quantity.value) return;
      quantity = next;
      render();
      element.dispatchEvent(new CustomEvent<QuantityChangeDetail>('quantitychange', {
        bubbles: true,
        detail: { value: quantity.value },
      }));
    }

    decrease.addEventListener('click', () => change(-1));
    increase.addEventListener('click', () => change(1));
    input?.form?.addEventListener('reset', (event) => {
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        quantity = initialQuantity;
        render();
      });
    });
    element.dataset.enhanced = 'true';
    render();
  });
}
