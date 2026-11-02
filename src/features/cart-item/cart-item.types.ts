// Application input supplied by a cart adapter, not a new Commerce API response shape.
export interface CartItemOption {
  name: string;
  value: string;
}

export interface CartItemInput {
  id: string;
  storefrontUid: string;
  title: string;
  selectedOptions?: CartItemOption[];
  unitPriceMinor: number | string;
  currency: string;
  quantity: number;
}

export interface CartItemImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface CartItemData {
  id: string;
  title: string;
  options: CartItemOption[];
  unitPrice: string;
  quantity: number;
  image?: CartItemImage;
}

export type CartItemRemovalMode = 'demo' | 'external';
export type DemoRemovalOutcome = 'success' | 'error' | 'uncertain';

export interface CartItemProps {
  item: CartItemData;
  removalMode: CartItemRemovalMode;
  demoOutcome?: DemoRemovalOutcome;
  disabled?: boolean;
  managed?: boolean;
}

// A supplied handler confirms the specific item it removed. Its unknown response is validated.
export type CartItemRemoveHandler = (itemId: string) => Promise<unknown>;

export type CartItemRemoveReply =
  | { ok: true; itemId: string }
  | { ok: false; message: string; uncertain?: boolean };

export type CartItemRemovalResult =
  | { state: 'removed'; itemId: string }
  | { state: 'error' | 'uncertain'; message: string };

export interface CartItemRemovedDetail {
  itemId: string;
}
