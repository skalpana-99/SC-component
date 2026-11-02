export type CartMode = 'demo' | 'live';
export type DemoCartOutcome = 'success' | 'error';

export interface CartConfig {
  mode: CartMode;
  baseUrl?: string;
}

export interface CartLine {
  storefront_uid: string;
  qty: number;
  variant?: string;
}

export interface AddedCartLine extends CartLine {
  line_id: string;
}

export interface CartSuccess {
  ok: true;
  cart_id: string;
  lines: AddedCartLine[];
}

export interface CartFailure {
  ok: false;
  reason: string;
  uncertain: boolean;
}

export type CartReply = CartSuccess | CartFailure;

export interface CartOutcome {
  state: 'success' | 'error' | 'uncertain';
  message: string;
}

export interface CartRouteResult {
  status: number;
  body: CartReply;
  cookies: string[];
}

export interface CartCatalogProduct {
  storefront_uid: string;
  title: string;
  listed: boolean;
  purchasable: boolean;
  is_pack: boolean;
  options?: unknown[];
  variants?: Array<{ item_code: string }>;
}

export interface CartExample {
  id: string;
  title: string;
  storefrontUid: string;
  requiresVariant: boolean;
  variants: Array<{ value: string; label: string }>;
}

export interface AddToCartButtonProps {
  id: string;
  formId: string;
  mode: CartMode;
  requiresVariant?: boolean;
  disabled?: boolean;
  demoOutcome?: DemoCartOutcome;
}
