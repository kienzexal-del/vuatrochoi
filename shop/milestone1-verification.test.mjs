// Milestone 1 Verification Test Suite: Direct Game Purchase, Dual Fulfillment, and Steam Guard Delivery
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { server, steamProxy } from './preview-server.mjs';
import {
  BANK_CONFIG,
  STEAM_ID_TO_SLOT_GAME,
  resolveGameSlug,
  SteamGuardProxy
} from './steam-guard-proxy.mjs';

const TEST_PORT = 4178; // Use dedicated port for milestone 1 tests to avoid conflict
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Helper: Fast deterministic mock fetch for upstream Steam Guard
const mockUpstreamSuccess = async (url, opts) => ({
  ok: true,
  status: 200,
  async json() {
    return { code: 1, msg: '获取验证码', data: '76B9R', url: '', wait: 3 };
  }
});

async function apiRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE_URL);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || (body ? 'POST' : 'GET'),
      headers: {
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

describe('Milestone 1: Direct Game Purchase, Dual Fulfillment & Steam Guard Delivery', () => {
  before(async () => {
    steamProxy.fetchFn = mockUpstreamSuccess;
    await new Promise((resolveStart, rejectStart) => {
      server.listen(TEST_PORT, '127.0.0.1', resolveStart);
      server.on('error', rejectStart);
    });
  });

  after(async () => {
    await steamProxy.resetQuota();
    await new Promise(res => server.close(res));
  });

  beforeEach(async () => {
    steamProxy.fetchFn = mockUpstreamSuccess;
    await steamProxy.resetQuota();
    steamProxy.orders = [];
  });

  describe('1. Steam Numeric App ID Mapping & Resolution', () => {
    test('Maps God of War Ragnarök 2322010 to god_of_war slot', () => {
      assert.equal(resolveGameSlug(2322010), 'god_of_war');
      assert.equal(resolveGameSlug('2322010'), 'god_of_war');
      assert.equal(resolveGameSlug('game_2322010'), 'god_of_war');
      const slot = steamProxy.allocateSlotForGame(2322010);
      assert.ok(slot);
      assert.equal(slot.id, 'slot-gow');
      assert.equal(slot.account, 'Aereww111');
      assert.equal(slot.password, 'Aereww111');
      assert.equal(slot.yzid, '18159');
    });

    test('Maps catalog games (COD 1938090, Cyberpunk 1091500, Spider-Man 1817190)', () => {
      assert.equal(resolveGameSlug(1938090), 'cod_mw');
      assert.equal(resolveGameSlug('1091500'), 'cyberpunk_2077');
      assert.equal(resolveGameSlug('game_1817190'), 'spiderman_miles');
      assert.equal(resolveGameSlug('combo_31'), 'combo_31');
      assert.equal(resolveGameSlug('combo'), 'combo_31');
    });
  });

  describe('2. Direct VietQR Pending Order Creation', () => {
    test('POST /api/steam/checkout with God of War (2322010) and pending=true creates PENDING order with VietQR info', async () => {
      const res = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010, pending: true });
      assert.equal(res.status, 201);
      assert.equal(res.json.ok, true);
      const order = res.json.order;
      assert.match(order.orderId, /^VTCH-OFF-\d{5}$/);
      assert.equal(order.status, 'PENDING');
      assert.equal(order.price, 50000);
      assert.ok(order.title.includes('God of War'));
      // Credentials must not be leaked in PENDING state
      assert.equal(order.account, undefined);
      assert.equal(order.password, undefined);

      // Verify paymentInfo bank instructions
      assert.ok(order.paymentInfo);
      assert.equal(order.paymentInfo.bank, 'MB');
      assert.equal(order.paymentInfo.account, '0000125042003');
      assert.equal(order.paymentInfo.name, 'NGUYEN VAN KIEN');
      assert.equal(order.paymentInfo.amount, 50000);
      assert.equal(order.paymentInfo.memo, order.orderId);
      assert.ok(order.paymentInfo.qrUrl.includes('img.vietqr.io/image/MB-0000125042003-compact2.png'));
    });

    test('POST /api/steam/checkout with combo_31 creates 100,000đ pending order', async () => {
      const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31', pending: true });
      assert.equal(res.status, 201);
      assert.equal(res.json.order.status, 'PENDING');
      assert.equal(res.json.order.price, 100000);
      assert.equal(res.json.order.paymentInfo.amount, 100000);
    });
  });

  describe('3. 1-Click Payment Simulation Trigger', () => {
    test('POST /api/steam/simulate-payment transitions PENDING order to PAID and delivers credentials', async () => {
      // 1. Create pending order for God of War Ragnarök
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010, pending: true });
      const orderId = create.json.order.orderId;
      assert.equal(create.json.order.status, 'PENDING');

      // 2. Trigger test payment simulation
      const sim = await apiRequest('/api/steam/simulate-payment', {}, { orderId });
      assert.equal(sim.status, 200);
      assert.equal(sim.json.ok, true);
      assert.equal(sim.json.order.status, 'PAID');
      assert.equal(sim.json.order.account, 'Aereww111');
      assert.equal(sim.json.order.password, 'Aereww111');
      assert.equal(sim.json.order.slotId, 'slot-gow');

      // 3. Confirm GET /api/steam/orders/:orderId reflects PAID state and credentials
      const get = await apiRequest(`/api/steam/orders/${orderId}`);
      assert.equal(get.status, 200);
      assert.equal(get.json.order.status, 'PAID');
      assert.equal(get.json.order.account, 'Aereww111');
      assert.equal(get.json.order.password, 'Aereww111');
    });

    test('Simulating non-existent orderId returns 404', async () => {
      const sim = await apiRequest('/api/steam/simulate-payment', {}, { orderId: 'VTCH-OFF-99999' });
      assert.equal(sim.status, 404);
      assert.equal(sim.json.ok, false);
      assert.equal(sim.json.error, 'ORDER_NOT_FOUND');
    });
  });

  describe('4. SePay Webhook Verification & Real Bank Payment Detection', () => {
    test('POST /api/sepay/webhook fulfills pending order when MB account and memo match', async () => {
      // 1. Create pending order for Mega Combo
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31', pending: true });
      const orderId = create.json.order.orderId;

      // 2. Receive mock SePay webhook
      const webhookPayload = {
        transferType: 'in',
        accountNumber: '0000125042003',
        transferAmount: 100000,
        content: `Chuyen khoan mua game ${orderId} NGUYEN VAN A`,
        referenceCode: 'SEP123456789'
      };

      const hookRes = await apiRequest('/api/sepay/webhook', {}, webhookPayload);
      assert.equal(hookRes.status, 200);
      assert.equal(hookRes.json.success, true);
      assert.equal(hookRes.json.orderId, orderId);
      assert.equal(hookRes.json.order.status, 'PAID');
      assert.equal(hookRes.json.order.account, 'whkzw21078');
      assert.equal(hookRes.json.order.password, 'yamvd58819');

      // 3. Verify order status query
      const check = await apiRequest(`/api/steam/orders/${orderId}`);
      assert.equal(check.json.order.status, 'PAID');
    });

    test('SePay webhook rejects wrong receiving account number', async () => {
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war', pending: true });
      const orderId = create.json.order.orderId;

      const badHook = await apiRequest('/api/sepay/webhook', {}, {
        transferType: 'in',
        accountNumber: '9999999999', // Mismatched account
        transferAmount: 50000,
        content: `Thanh toan ${orderId}`
      });
      assert.equal(badHook.status, 400);
      assert.equal(badHook.json.success, false);
      assert.equal(badHook.json.error, 'INVALID_ACCOUNT');
    });

    test('SePay webhook ignores outgoing transfers (transferType = out)', async () => {
      const outHook = await apiRequest('/api/sepay/webhook', {}, {
        transferType: 'out',
        accountNumber: '0000125042003',
        transferAmount: 50000,
        content: 'Rut tien'
      });
      assert.equal(outHook.status, 200);
      assert.equal(outHook.json.success, false);
      assert.ok(outHook.json.message.includes('transferType != in'));
    });

    test('POST /api/sepay/webhook with underpayment is rejected with UNDERPAID and order remains PENDING', async () => {
      // Create pending order for God of War (50,000đ)
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010, pending: true });
      const orderId = create.json.order.orderId;
      assert.equal(create.json.order.status, 'PENDING');

      // Attempt underpayment with 500đ
      const underpayRes = await apiRequest('/api/sepay/webhook', {}, {
        transferType: 'in',
        accountNumber: '0000125042003',
        transferAmount: 500,
        content: `Thanh toan ${orderId}`
      });
      assert.equal(underpayRes.status, 400);
      assert.equal(underpayRes.json.success, false);
      assert.equal(underpayRes.json.error, 'UNDERPAID');
      assert.equal(underpayRes.json.message, 'Số tiền chuyển khoản không đủ so với giá đơn hàng');

      // Confirm order remains PENDING and credentials are NOT leaked
      const check = await apiRequest(`/api/steam/orders/${orderId}`);
      assert.equal(check.status, 200);
      assert.equal(check.json.order.status, 'PENDING');
      assert.equal(check.json.order.account, undefined);
      assert.equal(check.json.order.password, undefined);
    });

    test('POST /api/sepay/webhook missing accountNumber is rejected', async () => {
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010, pending: true });
      const orderId = create.json.order.orderId;

      const missingAccountRes = await apiRequest('/api/sepay/webhook', {}, {
        transferType: 'in',
        // accountNumber is missing
        transferAmount: 50000,
        content: `Thanh toan ${orderId}`
      });
      assert.equal(missingAccountRes.status, 400);
      assert.equal(missingAccountRes.json.success, false);
      assert.equal(missingAccountRes.json.error, 'INVALID_ACCOUNT');
    });

    test('POST /api/sepay/webhook missing transferType is rejected', async () => {
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010, pending: true });
      const orderId = create.json.order.orderId;

      const missingTypeRes = await apiRequest('/api/sepay/webhook', {}, {
        // transferType is missing
        accountNumber: '0000125042003',
        transferAmount: 50000,
        content: `Thanh toan ${orderId}`
      });
      assert.equal(missingTypeRes.status, 400);
      assert.equal(missingTypeRes.json.success, false);
      assert.equal(missingTypeRes.json.error, 'INVALID_TRANSFER_TYPE');
    });
  });

  describe('5. Store Integration: GET /api/orders/:id & safeOrder', () => {
    test('GET /api/orders/:id returns Steam order details for store.mjs', async () => {
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010 });
      const orderId = create.json.order.orderId;

      const res = await apiRequest(`/api/orders/${orderId}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.order.id, orderId);
      assert.equal(res.json.order.account, 'Aereww111');
      assert.equal(res.json.order.password, 'Aereww111');
      assert.equal(res.json.order.status, 'PAID');
    });
  });

  describe('6. Steam Guard Retrieval & 3-Second Cooldown Enforcement', () => {
    test('POST /api/steam/guard on fulfilled order retrieves 2FA code', async () => {
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010 });
      const orderId = create.json.order.orderId;

      const guardRes = await apiRequest('/api/steam/guard', {}, { orderId });
      assert.equal(guardRes.status, 200);
      assert.equal(guardRes.json.ok, true);
      assert.equal(guardRes.json.code, '76B9R');
      assert.equal(guardRes.json.wait, 3);
    });

    test('Rapid successive Steam Guard query within 3s is rejected with 429 COOLDOWN_ACTIVE', async () => {
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010 });
      const orderId = create.json.order.orderId;

      await apiRequest('/api/steam/guard', {}, { orderId });
      const second = await apiRequest('/api/steam/guard', {}, { orderId });
      assert.equal(second.status, 429);
      assert.equal(second.json.ok, false);
      assert.equal(second.json.error, 'COOLDOWN_ACTIVE');
      assert.ok(second.json.message.includes('Vui lòng chờ'));
      assert.equal(second.json.wait, 3);
    });

    test('fetchGuardCode on an unpaid PENDING order is rejected with ORDER_NOT_PAID and does not leak credentials', async () => {
      // 1. Create a pending unpaid order
      const create = await apiRequest('/api/steam/checkout', {}, { gameId: 2322010, pending: true });
      const orderId = create.json.order.orderId;
      assert.equal(create.json.order.status, 'PENDING');
      assert.equal(create.json.order.account, undefined);
      assert.equal(create.json.order.password, undefined);

      // 2. Direct proxy call test
      const proxyRes = await steamProxy.fetchGuardCode(orderId);
      assert.equal(proxyRes.ok, false);
      assert.equal(proxyRes.error, 'ORDER_NOT_PAID');
      assert.equal(proxyRes.account, undefined);
      assert.equal(proxyRes.password, undefined);
      assert.equal(proxyRes.code, undefined);
      assert.equal(proxyRes.message, 'Đơn hàng chưa được thanh toán. Vui lòng thanh toán trước khi lấy mã Steam Guard.');

      // 3. HTTP endpoint call test (maps to HTTP 402 or 400)
      const httpRes = await apiRequest('/api/steam/guard', {}, { orderId });
      assert.ok([400, 402].includes(httpRes.status));
      assert.equal(httpRes.json.ok, false);
      assert.equal(httpRes.json.error, 'ORDER_NOT_PAID');
      assert.equal(httpRes.json.account, undefined);
      assert.equal(httpRes.json.password, undefined);
      assert.equal(httpRes.json.code, undefined);

      // 4. Verify order state remains PENDING with no credentials
      const orderCheck = await apiRequest(`/api/steam/orders/${orderId}`);
      assert.equal(orderCheck.json.order.status, 'PENDING');
      assert.equal(orderCheck.json.order.account, undefined);
      assert.equal(orderCheck.json.order.password, undefined);
    });
  });

  describe('7. Zero Chinese Character Leakage', () => {
    test('Error messages and responses never contain Chinese characters', async () => {
      const badOrder = await apiRequest('/api/steam/guard', {}, { orderId: 'VTCH-OFF-00000' });
      assert.equal(/[\u4e00-\u9fa5]/.test(badOrder.text), false);

      const badCheckout = await apiRequest('/api/steam/checkout', {}, { gameId: 'non_existent_game' });
      assert.equal(/[\u4e00-\u9fa5]/.test(badCheckout.text), false);
    });

    test('GET /api/steam/catalog and checkout responses contain 0 Chinese characters', async () => {
      const catRes = await apiRequest('/api/steam/catalog');
      assert.equal(catRes.status, 200);
      assert.equal(/[\u4e00-\u9fa5]/.test(catRes.text), false, 'Catalog response contains Chinese characters');

      // Verify each single game title and combo title in catalog
      for (const single of catRes.json.singles) {
        assert.equal(/[\u4e00-\u9fa5]/.test(single.title), false, `Single game title has Chinese: ${single.title}`);
      }
      assert.equal(/[\u4e00-\u9fa5]/.test(catRes.json.combo.title), false);

      // Test checkout for combo and each single game
      const comboCheckout = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
      assert.equal(/[\u4e00-\u9fa5]/.test(comboCheckout.text), false, 'Combo checkout contains Chinese');

      for (const single of catRes.json.singles) {
        const checkoutRes = await apiRequest('/api/steam/checkout', {}, { gameId: single.id, pending: true });
        assert.equal(/[\u4e00-\u9fa5]/.test(checkoutRes.text), false, `Checkout for ${single.id} contains Chinese`);
      }
    });
  });
});
