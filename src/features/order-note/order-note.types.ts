import type { CartMode } from '../add-to-cart/add-to-cart.types';

export type NoteDemoOutcome = 'success' | 'error' | 'uncertain';

export type OrderNoteReply =
  | { ok: true; order_note: string | null }
  | { ok: false; reason: string; uncertain: boolean };

export type OrderNoteReadResult = OrderNoteReply;

export type OrderNoteValidation =
  | { ok: true; note: string | null }
  | { ok: false; reason: 'order_note_too_long' | 'order_note_not_sendable' | 'order_note_not_text'; message: string };

export interface OrderNoteFieldData {
  note: string;
  available: boolean;
  maxLength: number;
  message: string;
}

export interface OrderNoteFieldProps {
  id: string;
  data: OrderNoteFieldData;
  mode: CartMode;
  label?: string;
}

export type OrderNoteSaveResult =
  | { state: 'saved'; note: string | null }
  | { state: 'error' | 'uncertain'; message: string; invalid: boolean };

export interface OrderNoteSavedDetail {
  orderNote: string | null;
}

export interface OrderNoteRouteResult {
  status: number;
  body: OrderNoteReply;
}
