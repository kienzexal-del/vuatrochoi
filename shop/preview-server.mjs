// Local-only demo & Staging Preview server. Never forwards requests to payment or production services.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { plans } from './shop-model.mjs';
import { SteamGuardProxy } from './steam-guard-proxy.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
let signedIn = false;
const rows = [
  {
    id: 'VTCH-DEMO01',
    plan: 'lifetime',
    amount: 100000,
    status: 'PAID',
    createdAt: '2026-11-20T12:00:00Z',
    key: 'DEMO-ONLY-NOT-A-REAL-LICENSE',
    demo: true
  }
];
const payment = { bank: 'MB', account: '0000000000', name: 'TAI KHOAN MINH HOA' };

// Initialize Staging Steam Guard Proxy with persistence
export const steamProxy = new SteamGuardProxy({
  stateFilePath: fileURLToPath(new URL('./.preview-state.json', import.meta.url))
});

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;

  const json = (value, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(value));
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // --- STEAM OFFLINE STAGING PREVIEW ENDPOINTS ---
  if (path === '/steam' || path === '/steam-preview' || path === '/steam/') {
    try {
      const html = await readFile(root + 'steam-preview.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    } catch {
      res.writeHead(404);
      res.end('steam-preview.html not found');
      return;
    }
  }

  if (path === '/api/steam/catalog' && req.method === 'GET') {
    const catalog = await steamProxy.getCatalog();
    json(catalog);
    return;
  }

  if (path === '/api/steam/checkout' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON payload: ' + e.message }, 400);
        return;
      }
      const payload = (parsed && typeof parsed === 'object') ? parsed : {};
      const result = await steamProxy.createOrder(payload);
      const status = result.ok ? 201 : result.error === 'OUT_OF_STOCK' ? 410 : 400;
      json(result, status);
    } catch (err) {
      json({ ok: false, error: 'BAD_REQUEST', message: err.message }, 400);
    }
    return;
  }

  if (path === '/api/steam/guard' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON payload: ' + e.message }, 400);
        return;
      }
      const payload = (parsed && typeof parsed === 'object') ? parsed : {};
      const { orderId } = payload;
      if (!orderId) {
        json({ ok: false, error: 'MISSING_ORDER_ID', message: 'Thiếu orderId' }, 400);
        return;
      }
      const result = await steamProxy.fetchGuardCode(orderId);
      let status = 200;
      if (!result.ok) {
        if (result.error === 'COOLDOWN_ACTIVE') status = 429;
        else if (result.error === 'OUT_OF_QUOTA') status = 410;
        else if (result.error === 'ORDER_NOT_FOUND') status = 404;
        else if (result.error === 'ORDER_NOT_PAID') status = 402;
        else status = 502;
      }
      json(result, status);
    } catch (err) {
      json({ ok: false, error: 'SERVER_ERROR', message: err.message }, 500);
    }
    return;
  }

  if (path.startsWith('/api/steam/orders/') && req.method === 'GET') {
    const orderId = path.split('/').at(-1);
    const order = await steamProxy.getOrder(orderId);
    if (order) json({ ok: true, order });
    else json({ ok: false, error: 'ORDER_NOT_FOUND' }, 404);
    return;
  }

  // Simulate payment completion (1-click test simulation for preview and local testing)
  if (path === '/api/steam/simulate-payment' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON payload: ' + e.message }, 400);
        return;
      }
      const payload = (parsed && typeof parsed === 'object') ? parsed : {};
      const { orderId } = payload;
      if (!orderId) {
        json({ ok: false, error: 'MISSING_ORDER_ID', message: 'Thiếu orderId' }, 400);
        return;
      }
      const result = await steamProxy.fulfillOrder(orderId);
      if (result.ok) {
        const r = rows.find(x => x.id === orderId);
        if (r) r.status = 'PAID';
        json({ ok: true, order: result.order }, 200);
      } else {
        const status = result.error === 'ORDER_NOT_FOUND' ? 404 : result.error === 'OUT_OF_STOCK' ? 410 : 400;
        json(result, status);
      }
    } catch (err) {
      json({ ok: false, error: 'SERVER_ERROR', message: err.message }, 500);
    }
    return;
  }

  // SePay Webhook Endpoint: Verifies incoming bank transfer and fulfills order
  if (path === '/api/sepay/webhook' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (e) {
        json({ success: false, error: 'BAD_REQUEST', message: 'Invalid JSON payload: ' + e.message }, 400);
        return;
      }

      const { transferType, accountNumber, content, transferAmount } = payload || {};

      if (!transferType) {
        json({ success: false, error: 'INVALID_TRANSFER_TYPE', message: 'Thiếu trường transferType' }, 400);
        return;
      }

      if (transferType !== 'in') {
        json({ success: false, message: 'Bỏ qua giao dịch không phải tiền vào (transferType != in)' }, 200);
        return;
      }

      if (!accountNumber || accountNumber !== '0000125042003') {
        json({ success: false, error: 'INVALID_ACCOUNT', message: 'Tài khoản nhận không hợp lệ hoặc không khớp' }, 400);
        return;
      }

      const match = String(content || '').match(/(VTCH(?:-[A-Z0-9]+)+)/i) || String(content || '').match(/(VTCH-?[A-Z0-9]+)/i);
      if (!match) {
        json({ success: false, error: 'ORDER_NOT_FOUND_IN_CONTENT', message: 'Không tìm thấy mã đơn hàng trong nội dung chuyển khoản' }, 400);
        return;
      }

      const orderId = match[1].toUpperCase();

      const order = (await steamProxy.getOrder(orderId)) || rows.find(x => x.id === orderId);
      if (!order) {
        json({ success: false, error: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng' }, 404);
        return;
      }

      const expectedPrice = order.price ?? order.amount ?? 0;
      const amount = Number(transferAmount);
      if (Number.isNaN(amount) || amount < expectedPrice) {
        json({ success: false, error: 'UNDERPAID', message: 'Số tiền chuyển khoản không đủ so với giá đơn hàng' }, 400);
        return;
      }

      const result = await steamProxy.fulfillOrder(orderId);
      if (result.ok) {
        const r = rows.find(x => x.id === orderId);
        if (r) r.status = 'PAID';
        json({ success: true, orderId, order: result.order }, 200);
      } else {
        const r = rows.find(x => x.id === orderId);
        if (r) {
          r.status = 'PAID';
          json({ success: true, orderId }, 200);
        } else {
          const status = result.error === 'ORDER_NOT_FOUND' ? 404 : result.error === 'OUT_OF_STOCK' ? 410 : 400;
          json({ success: false, error: result.error, message: result.message }, status);
        }
      }
    } catch (err) {
      json({ success: false, error: 'SERVER_ERROR', message: err.message }, 500);
    }
    return;
  }

  // Staging debug endpoint: Reset or manipulate slot quotas
  if (path === '/api/admin/reset-quota' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid JSON payload: ' + e.message }, 400);
        return;
      }
      const payload = (parsed && typeof parsed === 'object') ? parsed : {};
      const result = await steamProxy.resetQuota(payload);
      json(result, result.ok ? 200 : 400);
    } catch (err) {
      json({ ok: false, error: 'BAD_REQUEST', message: err.message }, 400);
    }
    return;
  }

  // --- EXISTING VUATROCHOI ENDPOINTS ---
  if (path === '/auth/login') {
    signedIn = true;
    const dest = url.searchParams.get('signin') === 'catalog' ? '/games/' : '/buy#orders';
    res.writeHead(302, { Location: dest });
    res.end();
    return;
  }
  if (path === '/api/shop-config') {
    json({ demo: true });
    return;
  }
  if (path === '/api/me') {
    json({ user: signedIn ? { name: 'Khách dùng thử' } : null, demo: true });
    return;
  }

  if (path.startsWith('/api/orders/') && req.method === 'GET') {
    const orderId = path.replace('/api/orders/', '');
    const order = rows.find(o => o.id === orderId);
    if (order) {
      json({ order });
      return;
    }
    const steamOrder = await steamProxy.getOrder(orderId);
    if (steamOrder) {
      json({
        order: {
          id: steamOrder.orderId,
          orderId: steamOrder.orderId,
          plan: steamOrder.gameId === 'combo_31' ? 'combo_31' : 'game_' + steamOrder.gameId,
          gameId: steamOrder.gameId,
          title: steamOrder.title,
          amount: steamOrder.price,
          status: steamOrder.status,
          createdAt: new Date(steamOrder.createdAt).toISOString(),
          account: steamOrder.account,
          password: steamOrder.password,
          slotId: steamOrder.slotId,
          key: steamOrder.account ? `Account: ${steamOrder.account} | Password: ${steamOrder.password}` : '',
          payment: steamOrder.paymentInfo || { bank: 'MB', account: '0000125042003', name: 'NGUYEN VAN KIEN' }
        }
      });
      return;
    }
    json({}, 404);
    return;
  }

  if (path.startsWith('/api/')) {
    if (!signedIn) {
      json({}, 401);
      return;
    }
    if (path === '/api/logout') {
      signedIn = false;
      json({ ok: true });
      return;
    }
    if (path === '/api/orders' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        let parsed;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          json({ ok: false, error: 'BAD_REQUEST' }, 400);
          return;
        }
        const payload = (parsed && typeof parsed === 'object') ? parsed : {};
        const p = plans.find(p => p.id === payload.plan) || { id: payload.plan, price: (payload.plan === 'combo_31' ? 100000 : 50000) };
        const order = {
          id: `VTCH-DEMO${String(rows.length + 1).padStart(2, '0')}`,
          plan: p.id,
          amount: p.price,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          payment,
          demo: true
        };
        rows.unshift(order);
        json({ order }, 201);
      } catch {
        json({}, 400);
      }
      return;
    }
    if (path === '/api/orders') {
      json({ orders: rows });
      return;
    }
    json({}, 404);
    return;
  }

  // Static files mapping
  const allowed = {
    '/games/': '../games/index.html',
    '/games/catalog.css': '../games/catalog.css',
    '/games/catalog.mjs': '../games/catalog.mjs',
    '/games/games.json': '../games/games.json',
    '/games/hls.min.js': '../games/hls.min.js',
    '/games/modern-warfare-4-vault.png': '../games/modern-warfare-4-vault.png',
    '/mobile/': '../mobile/index.html',
    '/shop/site-menu.mjs': 'site-menu.mjs',
    '/index.mobile.html': '../index.mobile.html',
    '/ios/': '../ios/index.html',
    '/android/VuaTroChoi_ByeDPI.apk': '../android/VuaTroChoi_ByeDPI.apk',
    '/': 'index.html',
    '/buy': 'index.html',
    '/steam': 'steam-preview.html',
    '/steam-preview': 'steam-preview.html',
    '/steam-preview.html': 'steam-preview.html',
    '/shop/steam-preview.html': 'steam-preview.html',
    '/shop/paper-background-landscape.jpg': 'paper-background-landscape.jpg',
    '/shop/paper-background-portrait.jpg': 'paper-background-portrait.jpg',
    '/shop/game-gia-re.png': 'game-gia-re.png',
    '/shop/store.css': 'store.css',
    '/shop/store.mjs': 'store.mjs',
    '/shop/google-session.mjs': 'google-session.mjs',
    '/shop/shop-model.mjs': 'shop-model.mjs'
  };

  const featured = /^\/games\/(featured-(?:1245620|1888930|1938090|2322010|2358720|2531310|2638890|3321460|4115450)\.(?:jpg|png))$/.exec(path);
  const file = allowed[path] ?? (featured ? '../games/' + featured[1] : null);
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  const types = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    jpg: 'image/jpeg',
    png: 'image/png',
    apk: 'application/vnd.android.package-archive'
  };
  res.writeHead(200, {
    'Content-Type': `${types[file.split('.').at(-1)] || 'text/plain'}`,
    'Cache-Control': 'no-store'
  });
  res.end(await readFile(root + file));
});

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.VTCH_PREVIEW_PORT || 4177);
  server.listen(port, '127.0.0.1', () =>
    console.log(`Local demo & Steam Offline preview: http://127.0.0.1:${port}/steam (no real payments)`)
  );
}
