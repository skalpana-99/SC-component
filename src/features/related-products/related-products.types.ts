import type { ProductCardData } from '../products/products.types';

// Caller-supplied relationships, separate from the commerce response schema.
export interface RelatedProductsSelection {
  productIds: string[];
  currentProductId?: string;
}

export interface RelatedProductsData {
  products: ProductCardData[];
}

export interface RelatedProductsProps {
  id: string;
  data: RelatedProductsData;
  heading?: string;
}
