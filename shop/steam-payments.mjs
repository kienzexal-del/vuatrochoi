import {verifyGoogle} from './gis-sheets-worker.mjs';
import games from '../games/games.json';

const reply = (data, status = 200) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store'}
});

export async function steamPaymentRoute(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/steam/')) return null;
  if (Number(request.headers.get('Content-Length') || 0) > 16384) return reply({ok: false}, 413);
  if (!env.STEAM_DB || !env.PAYMENT_ACCOUNT || !env.SEPAY_WEBHOOK_SECRET ||
      !env.GOOGLE_CLIENT_ID) return reply({ok: false, error: 'NOT_CONFIGURED'}, 503);
  if (request.method === 'POST' && url.pathname === '/api/steam/webhook') {
    if (request.headers.get('Authorization') !== 'Apikey ' + env.SEPAY_WEBHOOK_SECRET) {
      return reply({ok: false}, 401);
    }
    const event = await request.json();
    const content = String(event.content || '');
    const orderId = content.match(/\bSG[A-F0-9]{24}\b/i)?.[0]?.toUpperCase();
    if (event.transferType !== 'in' || String(event.accountNumber) !== env.PAYMENT_ACCOUNT ||
        !Number.isSafeInteger(event.transferAmount) || event.transferAmount <= 0 ||
        !Number.isSafeInteger(event.id) || event.id <= 0 || !orderId) {
      return reply({success: true, accepted: false});
    }
    const order = await env.STEAM_DB.prepare('SELECT amount FROM steam_orders WHERE id = ?')
      .bind(orderId).first();
    if (!order || order.amount !== event.transferAmount) return reply({success: true, accepted: false});
    // The insert and both triggers commit atomically. Unique transaction/order IDs prevent replay.
    await env.STEAM_DB.prepare(
      'INSERT OR IGNORE INTO steam_transactions(id,order_id,amount) VALUES(?,?,?)'
    ).bind(String(event.id), orderId, event.transferAmount).run();
    return reply({success: true});
  }
  if (request.headers.get('Origin') !== url.origin) return reply({ok: false}, 403);
  if (request.method !== 'POST') return reply({ok: false}, 405);
  const auth = request.headers.get('Authorization') || '';
  const owner = await verifyGoogle(auth.startsWith('Bearer ') ? auth.slice(7) : '', env.GOOGLE_CLIENT_ID);
  if (!owner) return reply({ok: false}, 401);
  const body = await request.json();
  if (url.pathname === '/api/steam/checkout') {
    const product = body.gameId === 'combo_31' ? {price: 100000} :
      games.some(game => String(game.id) === String(body.gameId)) ? {price: 50000} : null;
    if (!product || !Number.isSafeInteger(product.price) || product.price <= 0 ||
        typeof body.requestId !== 'string' || !/^[\w-]{16,64}$/.test(body.requestId)) {
      return reply({ok: false, error: 'INVALID_PRODUCT'}, 400);
    }
    const stock = await env.STEAM_DB.prepare(
      'SELECT s.id FROM steam_stock s WHERE s.product_id = ? AND s.order_id IS NULL AND NOT EXISTS (SELECT 1 FROM steam_stock used WHERE used.username=s.username AND used.order_id IS NOT NULL) LIMIT 1'
    ).bind(String(body.gameId)).first();
    if (!stock) return reply({ok: false, error: 'OUT_OF_STOCK'}, 409);
    const pending = await env.STEAM_DB.prepare(
      "SELECT COUNT(*) AS total FROM steam_orders WHERE owner=? AND status='PENDING' AND created_at>datetime('now','-1 hour')"
    ).bind(owner).first();
    if (pending.total >= 5) return reply({ok: false, error: 'TOO_MANY_PENDING_ORDERS'}, 429);
    const id = 'SG' + crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase();
    await env.STEAM_DB.prepare(
      'INSERT OR IGNORE INTO steam_orders(id,owner,product_id,amount,request_id) VALUES(?,?,?,?,?)'
    ).bind(id, owner, String(body.gameId), product.price, body.requestId).run();
    const order = await env.STEAM_DB.prepare(
      'SELECT id AS orderId,product_id AS gameId,amount AS price,status FROM steam_orders WHERE owner=? AND request_id=?'
    ).bind(owner, body.requestId).first();
    return reply({ok: true, order});
  }
  if (url.pathname === '/api/steam/order') {
    const order = await env.STEAM_DB.prepare(
      'SELECT id AS orderId,product_id AS gameId,amount AS price,status FROM steam_orders WHERE id=? AND owner=?'
    ).bind(String(body.orderId || ''), owner).first();
    if (!order) return reply({ok: false}, 404);
    if (order.status === 'PAID') {
      const stock = await env.STEAM_DB.prepare(
        'SELECT username AS account,password FROM steam_stock WHERE order_id=?'
      ).bind(order.orderId).first();
      if (stock) Object.assign(order, stock);
      else order.status = 'AWAITING_STOCK';
    }
    return reply({ok: true, order});
  }
  return reply({ok: false}, 404);
}
