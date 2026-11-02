import fixture from './catalog.demo.json';
import type { CatalogData, CatalogProduct, MinorAmount, ProductsConfig, StockBand } from './products.types';

export class CatalogError extends Error {
  override name = 'CatalogError';
}

export function readProductsConfig(env: NodeJS.ProcessEnv): ProductsConfig {
  const mode = env.PRODUCTS_DATA_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') {
    throw new CatalogError('PRODUCTS_DATA_MODE must be demo or live.');
  }
  return { mode, baseUrl: env.COMMERCE_API_BASE_URL };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Validate integer minor units without coercing null, blanks, or malformed prices to zero.
function isMinorAmount(value: unknown): value is MinorAmount {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return false;
  return (typeof value === 'number' || typeof value === 'string')
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export function parseCatalog(value: unknown): CatalogData {
  if (!isRecord(value) || value.ok !== true) {
    throw new CatalogError('Catalogue response did not report ok:true.');
  }
  if (!Array.isArray(value.products) || !Array.isArray(value.packs)) {
    throw new CatalogError('Catalogue response must contain products and packs arrays.');
  }
  const currencies = Intl.supportedValuesOf('currency');
  const bands: StockBand[] = ['out', 'low', 'in_stock', 'preorder'];
  const products = value.products.map((product: unknown, index): CatalogProduct => {
    const invalid = () => new CatalogError(`Invalid catalogue product at index ${index}.`);
    if (!isRecord(product)
      || typeof product.storefront_uid !== 'string' || !product.storefront_uid.trim()
      || typeof product.title !== 'string' || !product.title.trim()
      || (product.listed !== undefined && typeof product.listed !== 'boolean')
      || !isMinorAmount(product.price_minor)
      || typeof product.currency !== 'string' || !currencies.includes(product.currency)
      || typeof product.band !== 'string' || !bands.includes(product.band as StockBand)) {
      throw invalid();
    }
    return {
      storefront_uid: product.storefront_uid,
      title: product.title,
      listed: product.listed,
      price_minor: product.price_minor,
      // An unusable optional comparison is omitted; a bad current price fails above.
      compare_at_minor: isMinorAmount(product.compare_at_minor) ? product.compare_at_minor : undefined,
      currency: product.currency,
      band: product.band as StockBand,
    };
  });
  // Packs, collections, options and variants are deliberately not consumed.
  return { products };
}

export async function getCatalog(config: ProductsConfig, fetcher: typeof fetch = fetch): Promise<CatalogData> {
  if (config.mode === 'demo') return parseCatalog(fixture);
  if (config.mode !== 'live') throw new CatalogError('Unknown catalogue data mode.');

  let endpoint: URL;
  try {
    if (!config.baseUrl) throw new Error('Missing base URL');
    endpoint = new URL(`${config.baseUrl.replace(/\/+$/, '')}/catalog`);
    if (!['https:', 'http:'].includes(endpoint.protocol)
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error('Invalid base URL');
    }
  } catch {
    throw new CatalogError('Live mode requires a valid COMMERCE_API_BASE_URL without credentials, query or fragment.');
  }

  try {
    const response = await fetcher(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) throw new CatalogError(`Commerce catalogue returned HTTP ${response.status}.`);
    return parseCatalog(await response.json());
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    // Do not expose upstream URLs, response bodies or credentials in page errors/logs.
    throw new CatalogError('Commerce catalogue request failed or returned invalid JSON.');
  }
}
