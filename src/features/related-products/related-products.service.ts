import type { ProductCardData } from '../products/products.types';
import type { RelatedProductsData, RelatedProductsSelection } from './related-products.types';

// Supply cards from getProductCards, which already filters listed:true and
// prepares prices, stock labels and supplementary images in one catalogue load.
export function prepareRelatedProducts(
  cards: ProductCardData[],
  selection: RelatedProductsSelection,
): RelatedProductsData {
  if (typeof selection !== 'object' || selection === null || !Array.isArray(selection.productIds)
    || selection.productIds.some(id => typeof id !== 'string' || !id.trim())
    || (selection.currentProductId !== undefined
      && (typeof selection.currentProductId !== 'string' || !selection.currentProductId.trim()))) {
    throw new TypeError('Related products need supplied product IDs and an optional current product ID.');
  }

  const byId = new Map(cards.map(card => [card.id, card]));
  const products: ProductCardData[] = [];
  for (const id of new Set(selection.productIds)) {
    if (id === selection.currentProductId) continue;
    const product = byId.get(id);
    if (product) products.push(product);
  }
  return { products };
}
