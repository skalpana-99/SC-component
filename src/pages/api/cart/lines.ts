import type { APIRoute } from 'astro';
import { isRecord } from '../../../features/add-to-cart/add-to-cart.api';
import { validateCartLine } from '../../../features/add-to-cart/add-to-cart.service';
import { readCartConfig, submitLiveCartLine } from '../../../features/add-to-cart/add-to-cart.server.api';

// Narrow same-origin action: only one plain product/variant line. No arbitrary upstream paths.
export const POST: APIRoute = async ({ request }) => {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  // Astro can canonicalise request.url to localhost; match the actual browser-facing host.
  const origin = `${new URL(request.url).protocol}//${request.headers.get('host')}`;
  if (request.headers.get('origin') !== origin) {
    return new Response(JSON.stringify({ ok: false, reason: 'refused', uncertain: false }), { status: 403, headers });
  }
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !Array.isArray(body.lines) || body.lines.length !== 1) throw new TypeError('Expected one line.');
    const line = validateCartLine(body.lines[0]);
    const result = await submitLiveCartLine(line, request, readCartConfig(process.env));
    for (const cookie of result.cookies) headers.append('Set-Cookie', cookie);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, reason: error instanceof TypeError || error instanceof SyntaxError ? 'invalid_selection' : 'unavailable', uncertain: false }), { status: error instanceof TypeError || error instanceof SyntaxError ? 400 : 503, headers });
  }
};
