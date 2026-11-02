import fixture from './cart-item.demo.json';
import type { CartItemInput, CartItemRemoveReply, DemoRemovalOutcome } from './cart-item.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseCartItems(value: unknown): CartItemInput[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new TypeError('Expected a cart item input list.');
  const ids = new Set<string>();
  return value.items.map((item: unknown): CartItemInput => {
    if (!isRecord(item)
      || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)
      || typeof item.storefrontUid !== 'string' || !item.storefrontUid.trim()
      || typeof item.title !== 'string' || !item.title.trim()
      || typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity) || item.quantity < 1
      || typeof item.currency !== 'string' || !Intl.supportedValuesOf('currency').includes(item.currency)
      || !['number', 'string'].includes(typeof item.unitPriceMinor)
      || (typeof item.unitPriceMinor === 'string' && !/^\d+$/.test(item.unitPriceMinor))
      || !Number.isSafeInteger(Number(item.unitPriceMinor)) || Number(item.unitPriceMinor) < 0
      || (item.selectedOptions !== undefined && (!Array.isArray(item.selectedOptions)
        || item.selectedOptions.some(option => !isRecord(option) || typeof option.name !== 'string'
          || !option.name.trim() || typeof option.value !== 'string' || !option.value.trim())))) {
      throw new TypeError('Invalid cart item identity, quantity, price, currency or selected options.');
    }
    ids.add(item.id);
    return {
      id: item.id, storefrontUid: item.storefrontUid, title: item.title,
      quantity: item.quantity, currency: item.currency,
      unitPriceMinor: item.unitPriceMinor as number | string,
      selectedOptions: item.selectedOptions as CartItemInput['selectedOptions'],
    };
  });
}

export async function loadDemoCartItems(): Promise<CartItemInput[]> {
  return parseCartItems(fixture);
}

// Explicit, non-persistent simulation. No backend endpoint, cart cookie or live request is used.
export async function demoRemoveCartItem(
  itemId: string, outcome: DemoRemovalOutcome = 'success',
): Promise<CartItemRemoveReply> {
  await new Promise(resolve => setTimeout(resolve, 500));
  if (outcome === 'uncertain') throw new Error('Simulated lost confirmation.');
  if (outcome === 'error') return { ok: false, message: 'We couldn’t remove this item. Please try again.' };
  return { ok: true, itemId };
}
