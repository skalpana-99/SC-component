import type { APIRoute } from 'astro';
import { isRecord } from '../../../features/add-to-cart/add-to-cart.api';
import { validateCartLine } from '../../../features/add-to-cart/add-to-cart.service';

// Explicit, non-persistent simulation. This route never imports or calls the live transport.
export const POST: APIRoute = async ({ request, url }) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !Array.isArray(body.lines) || body.lines.length !== 1) throw new Error('Expected one line.');
    const line = validateCartLine(body.lines[0]);
    await new Promise(resolve => setTimeout(resolve, 600));
    const refused = url.searchParams.get('outcome') === 'error';
    return new Response(JSON.stringify(refused
      ? { ok: false, reason: 'variant_unavailable', uncertain: false }
      : { ok: true, cart_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lines: [{ ...line, line_id: crypto.randomUUID() }] }),
    { status: refused ? 409 : 200, headers });
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'invalid_selection', uncertain: false }), { status: 400, headers });
  }
};
