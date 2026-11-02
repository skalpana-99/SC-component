import type { CartItemImage } from './cart-item.types';

// Supplementary sample photography, separate from cart input and commerce response types.
export const cartItemMedia: Record<string, CartItemImage> = {
  '11111111-1111-4111-8111-111111111111': {
    src: '/images/track-jacket.jpg', alt: 'Sample olive jacket worn over a white top', width: 900, height: 1200,
  },
  '33333333-3333-4333-8333-333333333333': {
    src: '/images/performance-tee.jpg', alt: 'Sample white short-sleeved crew-neck T-shirt', width: 900, height: 1200,
  },
};
