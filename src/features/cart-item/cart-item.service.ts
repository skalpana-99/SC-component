import { loadDemoCartItems } from './cart-item.api';
import { cartItemMedia } from './cart-item.media';
import type { CartItemData, CartItemInput, CartItemRemovalResult, CartItemRemoveHandler } from './cart-item.types';

export function toCartItem(input: CartItemInput): CartItemData {
  const minor = Number(input.unitPriceMinor);
  const currencyDigits = new Intl.NumberFormat('en-LK', { style: 'currency', currency: input.currency }).resolvedOptions().maximumFractionDigits!;
  const factor = 10 ** currencyDigits;
  return {
    id: input.id, title: input.title, quantity: input.quantity,
    options: (input.selectedOptions ?? []).map(option => ({ name: option.name.trim(), value: option.value.trim() })),
    unitPrice: new Intl.NumberFormat('en-LK', {
      style: 'currency', currency: input.currency, currencyDisplay: 'code',
      minimumFractionDigits: minor % factor === 0 ? 0 : currencyDigits, maximumFractionDigits: currencyDigits,
    }).format(minor / factor),
    image: Object.hasOwn(cartItemMedia, input.storefrontUid) ? cartItemMedia[input.storefrontUid] : undefined,
  };
}

export async function getCartItems(load: () => Promise<CartItemInput[]> = loadDemoCartItems): Promise<CartItemData[]> {
  return (await load()).map(toCartItem);
}

export async function removeCartItem(itemId: string, remove: CartItemRemoveHandler): Promise<CartItemRemovalResult> {
  try {
    const reply = await remove(itemId);
    if (typeof reply === 'object' && reply !== null && 'ok' in reply) {
      if (reply.ok === true && 'itemId' in reply && reply.itemId === itemId) return { state: 'removed', itemId };
      if (reply.ok === false && 'message' in reply && typeof reply.message === 'string' && reply.message.trim()) {
        return {
          state: 'uncertain' in reply && reply.uncertain === true ? 'uncertain' : 'error',
          message: reply.message,
        };
      }
    }
  } catch {
    // A rejected promise does not prove that a future remote removal failed.
  }
  return { state: 'uncertain', message: 'We couldn’t confirm removal. Check your cart before trying again.' };
}
