import { getCatalog } from './products.api';
import { productMedia } from './products.media';
import type { CatalogData, CatalogProduct, ProductCardData, ProductsConfig } from './products.types';

function money(minor: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-LK', {
    style: 'currency', currency, currencyDisplay: 'code',
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits!;
  const amount = minor / 10 ** digits;
  return new Intl.NumberFormat('en-LK', {
    style: 'currency', currency, currencyDisplay: 'code',
    minimumFractionDigits: minor % 10 ** digits === 0 ? 0 : digits, maximumFractionDigits: digits,
  }).format(amount);
}

export function toProductCard(product: CatalogProduct): ProductCardData {
  const price = Number(product.price_minor);
  const comparison = product.compare_at_minor == null ? undefined : Number(product.compare_at_minor);
  return {
    id: product.storefront_uid,
    title: product.title,
    price: money(price, product.currency),
    // The business meaning of compare_at_minor still needs backend confirmation.
    comparisonPrice: comparison !== undefined && comparison > price
      ? money(comparison, product.currency) : undefined,
    stockLabel: product.band === 'low' ? 'Low stock' : undefined,
    image: Object.hasOwn(productMedia, product.storefront_uid) ? productMedia[product.storefront_uid] : undefined,
  };
}

export async function getProductCards(
  config: ProductsConfig,
  loadCatalog: (config: ProductsConfig) => Promise<CatalogData> = getCatalog,
): Promise<ProductCardData[]> {
  const { products } = await loadCatalog(config);
  return products.filter((product) => product.listed === true).map(toProductCard);
}
