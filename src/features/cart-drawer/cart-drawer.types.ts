import type { CartMode, CartLine, CartConfig } from '../add-to-cart/add-to-cart.types';
import type { CartItemData, CartItemInput, CartItemOption } from '../cart-item/cart-item.types';

export interface CartDrawerConfig extends CartConfig {
  checkoutHref?: string;
}

export interface CartDrawerRequest {
  scenario: 'populated' | 'empty' | 'error';
  removedIds: string[];
  additions: CartLine[];
}

export interface CartDrawerTotals {
  currency: string;
  netMinor: number | string;
  taxMinor: number | string;
  totalMinor: number | string;
}

export interface CartDrawerSnapshot {
  items: CartItemInput[];
  totals: CartDrawerTotals | null;
}

export interface CartDrawerData {
  items: CartItemData[];
  itemCount: number;
  totals: { net: string; tax: string; total: string } | null;
  checkoutHref?: string;
}

export interface CartDrawerProps {
  id: string;
  mode: CartMode;
  initialView: CartDrawerData;
}

export interface CartDrawerPanelProps {
  view: CartDrawerData;
}

export interface CartDrawerResponse {
  element: HTMLElement;
  itemCount: number;
}

export interface DrawerQuoteLine {
  idx: number;
  line_id: string | null;
  storefront_uid: string;
  item_code: string;
  qty: number;
  rate_minor: number | string;
  variant?: string;
  options?: CartItemOption[];
}

export interface DrawerQuote {
  currency: string;
  lines: DrawerQuoteLine[];
  net_total_minor: number | string;
  tax_total_minor: number | string;
  grand_total_minor: number | string;
}

export interface DrawerCatalogProduct {
  storefront_uid: string;
  title: string;
  options?: Array<{ name: string }>;
  variants?: Array<{ item_code: string; values: string[] }>;
}
