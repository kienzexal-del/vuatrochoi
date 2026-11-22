import {shopAccount} from './google-auth.mjs';
import {plans, validOrder} from './shop-model.mjs';

const reply = (data, status = 200) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store'}
});
const publicOrder = row => ({
  id: row.order_id, plan: row.plan, amount: row.amount, status: row.status,
  createdAt: row.created_at
});

async function appsScript(env, params) {
  const endpoint = new URL(env.ORDER_API_URL);
  if (endpoint.origin !== 'https://script.google.com') throw new Error('Invalid order provider');
  endpoint.search = new URLSearchParams(params);
  const response = await fetch(endpoint, {signal: AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Order provider unavailable');
  return response.json();
}

export async function accountOrderRoute(request, env) {
  const path = new URL(request.url).pathname;
  const match = /^\/api\/orders(?:\/([A-Z0-9-]{6,64}))?$/.exec(path);
  if (!match) return null;
  const [, orderId] = match;
  const account = await shopAccount(request, env);
  if (!account) return reply({}, 401);
  const db = env.SHOP_DB;
  const owner = account.google_sub;
  if (request.method === 'GET' && !orderId) {
    const {results} = await db.prepare(
      'SELECT order_id, plan, amount, status, created_at FROM shop_orders WHERE owner = ? AND order_id IS NOT NULL ORDER BY created_at DESC'
    ).bind(owner).all();
    return reply({orders: results.map(publicOrder)});
  }
  if (request.method === 'GET' && orderId) {
    const row = await db.prepare('SELECT * FROM shop_orders WHERE owner = ? AND order_id = ?').bind(owner, orderId).first();
    if (!row) return reply({}, 404);
    try {
      const result = await appsScript(env, {action: 'check_order', orderId, token: row.order_token});
      if (!['PENDING', 'PAID', 'UNDERPAID', 'EXPIRED', 'CANCELLED'].includes(result.status)) return reply({}, 502);
      const status = row.status === 'PAID' ? 'PAID' : result.status;
      await db.prepare("UPDATE shop_orders SET status = ? WHERE owner = ? AND order_id = ? AND status <> 'PAID'")
        .bind(status, owner, orderId).run();
      const order = {...publicOrder(row), status};
      if (status === 'PAID' && result.status === 'PAID' && typeof result.key === 'string') order.key = result.key;
      if (status === 'PENDING') order.payment = {bank: env.PAYMENT_BANK, account: env.PAYMENT_ACCOUNT, name: env.PAYMENT_NAME};
      return reply({order});
    } catch {
      return reply({}, 502);
    }
  }
  if (request.method !== 'POST' || orderId) return reply({}, 405);
  if (request.headers.get('Origin') !== env.SHOP_ORIGIN) return reply({}, 403);
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
  if (!/^[a-f0-9-]{36}$/i.test(idempotencyKey)) return reply({}, 400);
  const body = await request.json().catch(() => null);
  const plan = plans.find(candidate => candidate.id === body?.plan);
  if (!plan || !env.PAYMENT_BANK || !env.PAYMENT_ACCOUNT || !env.PAYMENT_NAME) return reply({}, 400);
  const createdAt = new Date().toISOString();
  const reservation = await db.prepare(
    'INSERT INTO shop_orders (owner, request_id, plan, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner, request_id) DO NOTHING'
  ).bind(owner, idempotencyKey, plan.id, plan.price, 'PENDING', createdAt).run();
  if (!reservation.meta.changes) {
    const existing = await db.prepare('SELECT * FROM shop_orders WHERE owner = ? AND request_id = ?')
      .bind(owner, idempotencyKey).first();
    return existing?.order_id && existing.plan === plan.id ? reply({order: publicOrder(existing)}) : reply({}, 409);
  }
  try {
    const result = await appsScript(env, {action: 'create_order', tier: plan.id, amount: plan.price});
    const order = {id: result.orderId, plan: plan.id, amount: plan.price, createdAt, status: 'PENDING'};
    if (!result.success || result.amount !== plan.price || !validOrder(order) ||
        typeof result.secretToken !== 'string' || !/^[a-f0-9]{32}$/i.test(result.secretToken)) return reply({}, 502);
    await db.prepare('UPDATE shop_orders SET order_id = ?, order_token = ? WHERE owner = ? AND request_id = ?')
      .bind(order.id, result.secretToken, owner, idempotencyKey).run();
    return reply({order}, 201);
  } catch {
    return reply({}, 502);
  }
}
