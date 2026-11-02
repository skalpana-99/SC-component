export type DataMode = 'demo' | 'live';
export type StockBand = 'out' | 'low' | 'in_stock' | 'preorder';
export type MinorAmount = number | string;

// Only the documented fields this feature consumes. This is not the full API schema.
export interface CatalogProduct {
  storefront_uid: string;
  title: string;
  listed?: boolean;
  price_minor: MinorAmount;
  compare_at_minor?: MinorAmount | null;
  currency: string;
  band: StockBand;
}

export interface CatalogData {
  products: CatalogProduct[];
}

export interface ProductsConfig {
  mode: DataMode;
  baseUrl?: string;
}

// Supplementary media is separate from the commerce API contract.
export interface ProductImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProductCardData {
  id: string;
  title: string;
  price: string;
  comparisonPrice?: string;
  stockLabel?: string;
  image?: ProductImage;
}

export interface ProductCardProps {
  product: ProductCardData;
  headingLevel?: 'h2' | 'h3';
}
