import type { ProductImage } from './products.types';

// Supplementary demo media, never part of the commerce API contract.
// Replace this lookup with a CMS/media resolver in the service when a source is agreed.
export const productMedia: Record<string, ProductImage> = {
  '11111111-1111-4111-8111-111111111111': {
    src: '/images/track-jacket.jpg',
    alt: 'Sample olive jacket worn over a white top against a neutral wall',
    width: 900, height: 1200,
  },
  '22222222-2222-4222-8222-222222222222': {
    src: '/images/oxford-shirt.jpg',
    alt: 'Sample blue patterned button-down shirt hanging against a grey background',
    width: 900, height: 1200,
  },
  '33333333-3333-4333-8333-333333333333': {
    src: '/images/performance-tee.jpg',
    alt: 'Sample short-sleeved crew-neck T-shirt',
    width: 900, height: 1200,
  },
};
