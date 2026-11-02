import { isRecord, requestAddToCart, UUID } from './add-to-cart.api';
import type { CartCatalogProduct, CartExample, CartLine, CartMode, CartOutcome, DemoCartOutcome } from './add-to-cart.types';

export function validateCartLine(value: unknown): CartLine {
  if (!isRecord(value) || typeof value.storefront_uid !== 'string' || !UUID.test(value.storefront_uid)) {
    throw new TypeError('Select a valid product before adding it to your cart.');
  }
  if (typeof value.qty !== 'number' || !Number.isSafeInteger(value.qty) || value.qty < 1) {
    throw new TypeError('Choose a positive whole quantity.');
  }
  if (value.variant !== undefined && (typeof value.variant !== 'string' || !value.variant.trim())) {
    throw new TypeError('Choose a valid product option.');
  }
  return {
    storefront_uid: value.storefront_uid, qty: value.qty,
    ...(typeof value.variant === 'string' ? { variant: value.variant.trim() } : {}),
  };
}

export function selectionFromForm(data: FormData, requiresVariant: boolean): CartLine {
  const qty = data.get('qty');
  const variant = data.get('variant');
  if (requiresVariant && (typeof variant !== 'string' || !variant.trim())) {
    throw new TypeError('Choose a product option before adding it to your cart.');
  }
  return validateCartLine({
    storefront_uid: data.get('storefront_uid'),
    qty: typeof qty === 'string' && /^\d+$/.test(qty) ? Number(qty) : NaN,
    ...(typeof variant === 'string' && variant.trim() ? { variant } : {}),
  });
}

export function cartExamples(products: CartCatalogProduct[]): CartExample[] {
  return products.filter(p => p.listed === true && p.purchasable === true && p.is_pack === false).map((p, index) => ({
    id: `cart-example-${index}`, title: p.title, storefrontUid: p.storefront_uid,
    requiresVariant: Boolean(p.options?.length || p.variants?.length),
    variants: (p.variants ?? []).map(variant => ({ value: variant.item_code, label: variant.item_code })),
  }));
}

export async function addSelectedToCart(
  line: CartLine, mode: CartMode, demoOutcome: DemoCartOutcome = 'success',
  submit = requestAddToCart,
): Promise<CartOutcome> {
  const selected = validateCartLine(line);
  const reply = await submit(selected, mode, demoOutcome);
  if (reply.ok) return { state: 'success', message: `${selected.qty} ${selected.qty === 1 ? 'item' : 'items'} added to your cart.` };
  if (reply.uncertain) return {
    state: 'uncertain', message: 'We couldn’t confirm whether this was added. Check your cart before adding again.',
  };
  const messages: Record<string, string> = {
    cart_busy: 'Another item is being added. Wait for it to finish, then try again.',
    variant_required: 'Choose a product option before adding it to your cart.',
    variant_unavailable: 'That option is no longer available. Choose another option.',
    variant_not_priced: 'That option cannot be bought online right now.',
    variant_not_expected: 'This product does not accept a variant selection.',
    cart_already_ordered: 'This cart has already been checked out. This item was not added.',
    cart_session_invalid: 'Your cart session is no longer valid. Start a new cart before trying again.',
    live_not_enabled: 'Live cart requests are not enabled for this site.',
    unavailable: 'The cart service could not be reached. Please try again shortly.',
    invalid_selection: 'Check the selected product, option and quantity.',
  };
  return { state: 'error', message: Object.hasOwn(messages, reply.reason) ? messages[reply.reason] : 'This item could not be added to your cart. Please try again.' };
}
