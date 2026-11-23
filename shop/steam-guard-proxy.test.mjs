// Automated Unit & Integration Tests for Steam Guard Proxy & Quota Engine
// Tests upstream parsing, 5-call quota ceiling, multi-slot rotation, fallback, and security.

import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import {
  SteamGuardProxy,
  DEFAULT_USER_CARD,
  DAILY_QUOTA_LIMIT,
  STEAM_CATALOG,
  translateUpstreamError
} from './steam-guard-proxy.mjs';
import { server } from './preview-server.mjs';

test('1. Upstream Call Parsing & Parameter Validation', async () => {
  let capturedUrl = '';
  let capturedHeaders = {};
  let capturedBody = '';

  const mockFetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    capturedBody = options.body;
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: 'W6TD7',
        url: '',
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // Test raw callUpstream
  const result = await proxy.callUpstream('28951');
  assert.equal(result.code, 1);
  assert.equal(result.data, 'W6TD7');
  assert.equal(result.wait, 3);

  // Validate upstream HTTP request headers and payload
  assert.equal(capturedUrl, 'https://a.zuhaox.cn/addons/cms/api/getEmail');
  assert.equal(capturedHeaders['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(capturedHeaders['Cookie'], `userCard=${DEFAULT_USER_CARD}`);
  assert.equal(capturedBody, 'yzid=28951');

  // Test upstream error parsing
  const mockErrorFetch = async () => ({
    ok: true,
    json: async () => ({
      code: 0,
      msg: '租用记录不存在，请刷新页面后重试',
      data: '',
      url: '',
      wait: 3
    })
  });
  const errorProxy = new SteamGuardProxy({ fetchFn: mockErrorFetch });
  await errorProxy.init();

  const errorResult = await errorProxy.callUpstream('00000');
  assert.equal(errorResult.code, 0);
  assert.match(errorResult.msg, /租用记录不存在/);
});

test('2. Quota Tracking (5 requests/day/slot ceiling)', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: `CD00${callCount}`,
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // Pick single-slot game (e.g. Cyberpunk)
  const orderRes = await proxy.createOrder({ gameId: 'cyberpunk_2077' });
  assert.equal(orderRes.ok, true);
  const orderId = orderRes.order.orderId;
  const slot = proxy.slots.find(s => s.id === orderRes.order.slotId);

  assert.equal(proxy.getSlotRemainingQuota(slot), 5);

  // Perform 5 retrievals (simulating cooldown bypass for unit test)
  for (let i = 1; i <= 5; i++) {
    const order = proxy.orders.find(o => o.orderId === orderId);
    order.lastFetchTime = 0; // reset cooldown for fast testing

    const res = await proxy.fetchGuardCode(orderId);
    assert.equal(res.ok, true);
    assert.equal(res.code, `CD00${i}`);
    assert.equal(res.remainingCalls, 5 - i);
    assert.equal(slot.timestamps.length, i);
  }

  assert.equal(proxy.getSlotRemainingQuota(slot), 0);

  // 6th call on this slot should detect quota exhaustion
  const order = proxy.orders.find(o => o.orderId === orderId);
  order.lastFetchTime = 0;
  const depletedRes = await proxy.fetchGuardCode(orderId);
  assert.equal(depletedRes.ok, false);
  assert.equal(depletedRes.error, 'OUT_OF_QUOTA');
  assert.equal(depletedRes.status, 'OUT_OF_STOCK');
  assert.match(depletedRes.message, /tạm hết hàng, vui lòng đợi/);

  // Test that timestamps older than 24 hours are expired
  const now = Date.now();
  slot.timestamps = [
    now - 25 * 60 * 60 * 1000, // 25 hours ago (expired)
    now - 26 * 60 * 60 * 1000, // 26 hours ago (expired)
    now - 1 * 60 * 60 * 1000   // 1 hour ago (valid)
  ];
  assert.equal(proxy.getSlotUsage(slot), 1);
  assert.equal(proxy.getSlotRemainingQuota(slot), 4);
});

test('3. Slot Rotation: Hitman Combo (Slot 1 [28951] -> Slot 2 [9041])', async () => {
  const queriedYzids = [];
  const mockFetch = async (url, options) => {
    const params = new URLSearchParams(options.body);
    queriedYzids.push(params.get('yzid'));
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: 'ROT01',
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // Create Mega Combo order
  const orderRes = await proxy.createOrder({ gameId: 'combo_31' });
  assert.equal(orderRes.ok, true);
  assert.equal(orderRes.order.slotId, 'slot-combo-1');

  // Fill slot 1 to its 5-request limit
  const slot1 = proxy.slots.find(s => s.id === 'slot-combo-1');
  slot1.timestamps = Array.from({ length: 5 }, () => Date.now() - 1000);
  assert.equal(proxy.getSlotRemainingQuota(slot1), 0);

  // Now trigger fetchGuardCode for the order
  const order = proxy.orders.find(o => o.orderId === orderRes.order.orderId);
  order.lastFetchTime = 0;

  const res = await proxy.fetchGuardCode(order.orderId);
  assert.equal(res.ok, true);
  assert.equal(res.slotRotated, true);
  assert.equal(order.slotId, 'slot-combo-2'); // Auto-rotated to slot 2!
  assert.equal(order.account, 'whkzw21078_b');

  // Verify that upstream was called with slot 2's yzid (9041)
  assert.equal(queriedYzids[queriedYzids.length - 1], '9041');
});

test('4. Slot Rotation: Onimusha (3-slot pool 15052 -> 8885 -> 8530)', async () => {
  const queriedYzids = [];
  const mockFetch = async (url, options) => {
    const params = new URLSearchParams(options.body);
    queriedYzids.push(params.get('yzid'));
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: 'ONI01',
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // Create Onimusha order
  const orderRes = await proxy.createOrder({ gameId: 'onimusha' });
  assert.equal(orderRes.ok, true);
  const orderId = orderRes.order.orderId;
  const order = proxy.orders.find(o => o.orderId === orderId);

  // Initially assigned to slot 1
  assert.equal(order.slotId, 'slot-onimusha-1');

  // Fill slot 1
  const slot1 = proxy.slots.find(s => s.id === 'slot-onimusha-1');
  slot1.timestamps = Array.from({ length: 5 }, () => Date.now() - 500);

  // Fetch -> should rotate to Slot 2 (8885)
  order.lastFetchTime = 0;
  const res1 = await proxy.fetchGuardCode(orderId);
  assert.equal(res1.ok, true);
  assert.equal(res1.slotRotated, true);
  assert.equal(order.slotId, 'slot-onimusha-2');
  assert.equal(queriedYzids[queriedYzids.length - 1], '8885');

  // Fill slot 2
  const slot2 = proxy.slots.find(s => s.id === 'slot-onimusha-2');
  slot2.timestamps = Array.from({ length: 5 }, () => Date.now() - 500);

  // Fetch -> should rotate to Slot 3 (8530)
  order.lastFetchTime = 0;
  const res2 = await proxy.fetchGuardCode(orderId);
  assert.equal(res2.ok, true);
  assert.equal(res2.slotRotated, true);
  assert.equal(order.slotId, 'slot-onimusha-3');
  assert.equal(queriedYzids[queriedYzids.length - 1], '8530');

  // Fill slot 3 as well (all 3 slots now exhausted)
  const slot3 = proxy.slots.find(s => s.id === 'slot-onimusha-3');
  slot3.timestamps = Array.from({ length: 5 }, () => Date.now() - 500);

  // Fetch -> triggers out-of-quota fallback!
  order.lastFetchTime = 0;
  const res3 = await proxy.fetchGuardCode(orderId);
  assert.equal(res3.ok, false);
  assert.equal(res3.error, 'OUT_OF_QUOTA');
  assert.equal(res3.status, 'OUT_OF_STOCK');
  assert.match(res3.message, /tạm hết hàng, vui lòng đợi/);
  assert.match(res3.message, /Admin/);
});

test('5. Out-of-Quota Fallback on Checkout and Catalog', async () => {
  const proxy = new SteamGuardProxy();
  await proxy.init();

  // Deplete all slots for Cyberpunk
  await proxy.resetQuota({ gameId: 'cyberpunk_2077', count: 5 });

  // Catalog check: Cyberpunk must show inStock: false and availableSlots: 0
  const catalog = await proxy.getCatalog();
  const cp = catalog.singles.find(s => s.id === 'cyberpunk_2077');
  assert.equal(cp.inStock, false);
  assert.equal(cp.availableSlots, 0);

  // Checkout attempt on depleted game must fail with Vietnamese message
  const checkoutRes = await proxy.createOrder({ gameId: 'cyberpunk_2077' });
  assert.equal(checkoutRes.ok, false);
  assert.equal(checkoutRes.error, 'OUT_OF_STOCK');
  assert.match(checkoutRes.message, /tạm hết hàng, vui lòng đợi/);
  assert.match(checkoutRes.message, /Admin/);
});

test('6. Security & Token Shielding (Strict isolation of userCard and yzid)', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      code: 1,
      msg: '获取验证码',
      data: 'SEC99',
      wait: 3
    })
  });

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // 1. Check Catalog output
  const catalog = await proxy.getCatalog();
  const catalogStr = JSON.stringify(catalog);
  assert.equal(catalogStr.includes(DEFAULT_USER_CARD), false, 'userCard must NEVER appear in catalog');
  assert.equal(catalogStr.includes('userCard'), false);
  assert.equal(catalogStr.includes('28951'), false, 'raw yzid must not be in catalog');
  assert.equal(catalogStr.includes('15052'), false, 'raw yzid must not be in catalog');

  // 2. Check Order output
  const orderRes = await proxy.createOrder({ gameId: 'hitman_woa' });
  const orderStr = JSON.stringify(orderRes);
  assert.equal(orderStr.includes(DEFAULT_USER_CARD), false, 'userCard must NEVER appear in order');
  assert.equal(orderStr.includes('28951'), false, 'raw yzid must not appear in order');
  assert.equal(orderRes.order.yzid, undefined, 'order.yzid must be undefined');

  // 3. Check Guard response
  const guardRes = await proxy.fetchGuardCode(orderRes.order.orderId);
  const guardStr = JSON.stringify(guardRes);
  assert.equal(guardStr.includes(DEFAULT_USER_CARD), false, 'userCard must NEVER appear in guard response');
  assert.equal(guardStr.includes('28951'), false, 'raw yzid must not appear in guard response');
  assert.equal(guardRes.yzid, undefined);
  assert.equal(guardRes.userCard, undefined);
});

test('7. Enforce 3-Second Cooldown Delay', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      code: 1,
      msg: '获取验证码',
      data: 'COOL1',
      wait: 3
    })
  });

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  const orderRes = await proxy.createOrder({ gameId: 'god_of_war' });
  const orderId = orderRes.order.orderId;

  // First call succeeds
  const res1 = await proxy.fetchGuardCode(orderId);
  assert.equal(res1.ok, true);

  // Immediate second call fails with COOLDOWN_ACTIVE and wait period
  const res2 = await proxy.fetchGuardCode(orderId);
  assert.equal(res2.ok, false);
  assert.equal(res2.error, 'COOLDOWN_ACTIVE');
  assert.ok(res2.wait > 0 && res2.wait <= 3);
});

test('8. Staging File Persistence & Quota Debug Operations', async () => {
  const tempPath = join(tmpdir(), `preview-state-test-${Date.now()}.json`);
  const proxy = new SteamGuardProxy({ stateFilePath: tempPath });
  await proxy.init();

  // Test resetQuota on a specific slot
  await proxy.resetQuota({ slotId: 'slot-gow', count: 5 });
  const gowSlot = proxy.slots.find(s => s.id === 'slot-gow');
  assert.equal(gowSlot.timestamps.length, 5);
  assert.equal(proxy.getSlotRemainingQuota(gowSlot), 0);

  // Test resetQuota count=0 (clearing)
  await proxy.resetQuota({ slotId: 'slot-gow', count: 0 });
  assert.equal(gowSlot.timestamps.length, 0);
  assert.equal(proxy.getSlotRemainingQuota(gowSlot), 5);

  // Verify file was written
  const proxy2 = new SteamGuardProxy({ stateFilePath: tempPath });
  await proxy2.init();
  const gowSlot2 = proxy2.slots.find(s => s.id === 'slot-gow');
  assert.equal(gowSlot2.timestamps.length, 0);

  // Cleanup
  try {
    await unlink(tempPath);
  } catch {}
});

test('9. Preview Server HTTP Routes Integration', async () => {
  // Start server on an ephemeral port
  const testServer = server;
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /steam
    const htmlRes = await fetch(`${baseUrl}/steam`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.match(htmlText, /VUA TRÒ CHƠI • STEAM OFFLINE/);
    assert.match(htmlText, /Gói Siêu Combo: 31 Game Bom Tấn AAA/);

    // 2. GET /api/steam/catalog
    const catRes = await fetch(`${baseUrl}/api/steam/catalog`);
    assert.equal(catRes.status, 200);
    const catData = await catRes.json();
    assert.equal(catData.ok, true);
    assert.equal(catData.combo.id, 'combo_31');
    assert.equal(catData.singles.length, 12);

    // 3. POST /api/steam/checkout
    const checkoutRes = await fetch(`${baseUrl}/api/steam/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: 'brotato' })
    });
    assert.equal(checkoutRes.status, 201);
    const checkoutData = await checkoutRes.json();
    assert.equal(checkoutData.ok, true);
    assert.ok(checkoutData.order.orderId.startsWith('VTCH-OFF-'));
    assert.equal(checkoutData.order.title, 'Brotato');

    // 4. GET /api/steam/orders/:id
    const orderRes = await fetch(`${baseUrl}/api/steam/orders/${checkoutData.order.orderId}`);
    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json();
    assert.equal(orderData.ok, true);
    assert.equal(orderData.order.orderId, checkoutData.order.orderId);

    // 5. POST /api/admin/reset-quota
    const resetRes = await fetch(`${baseUrl}/api/admin/reset-quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 0 })
    });
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.equal(resetData.ok, true);
  } finally {
    await new Promise(resolve => testServer.close(resolve));
  }
});

test('10. Concurrency Protection: Rapid Parallel Requests on Same Order Lock Cooldown', async () => {
  let upstreamCalls = 0;
  const mockFetch = async () => {
    upstreamCalls++;
    await new Promise(r => setTimeout(r, 50));
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: 'CONC1',
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  const orderRes = await proxy.createOrder({ gameId: 'god_of_war' });
  const orderId = orderRes.order.orderId;

  // Fire 5 concurrent requests on the exact same order
  const results = await Promise.all([
    proxy.fetchGuardCode(orderId),
    proxy.fetchGuardCode(orderId),
    proxy.fetchGuardCode(orderId),
    proxy.fetchGuardCode(orderId),
    proxy.fetchGuardCode(orderId)
  ]);

  const successes = results.filter(r => r.ok);
  const cooldowns = results.filter(r => r.error === 'COOLDOWN_ACTIVE');

  assert.equal(successes.length, 1, 'Exactly one concurrent request must succeed');
  assert.equal(cooldowns.length, 4, 'All other concurrent requests must be rejected with COOLDOWN_ACTIVE');
  assert.equal(upstreamCalls, 1, 'Only one upstream call should be made');

  const slot = proxy.slots.find(s => s.id === orderRes.order.slotId);
  assert.equal(slot.timestamps.length, 1, 'Exactly one timestamp recorded');
});

test('11. Concurrency Protection: Slot Quota In-Flight Reservation Prevents Over-Limit Dispatches', async () => {
  let upstreamCalls = 0;
  const mockFetch = async () => {
    upstreamCalls++;
    await new Promise(r => setTimeout(r, 50));
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: 'QUOTA_OK',
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // Create 10 distinct orders for single-slot game (brotato, limit 5)
  const orders = [];
  for (let i = 0; i < 10; i++) {
    const o = await proxy.createOrder({ gameId: 'brotato' });
    orders.push(o.order);
  }

  // Fire 10 concurrent requests simultaneously across all orders
  const results = await Promise.all(orders.map(o => proxy.fetchGuardCode(o.orderId)));

  const successes = results.filter(r => r.ok);
  const outOfQuotas = results.filter(r => r.error === 'OUT_OF_QUOTA');

  assert.equal(successes.length, 5, 'Exactly 5 requests should succeed (daily limit)');
  assert.equal(outOfQuotas.length, 5, '5 requests exceeding capacity should be rejected with OUT_OF_QUOTA');
  assert.equal(upstreamCalls, 5, 'Upstream should only receive 5 calls');

  const slot = proxy.slots.find(s => s.id === 'slot-brotato');
  assert.equal(slot.timestamps.length, 5, 'Slot timestamps must not exceed 5');
  assert.match(outOfQuotas[0].message, /tạm hết hàng, vui lòng đợi/);
});

test('12. Concurrency Protection: Multi-Slot Rotation Under Parallel Load', async () => {
  const queriedYzids = [];
  const mockFetch = async (url, options) => {
    const params = new URLSearchParams(options.body);
    queriedYzids.push(params.get('yzid'));
    await new Promise(r => setTimeout(r, 50));
    return {
      ok: true,
      json: async () => ({
        code: 1,
        msg: '获取验证码',
        data: 'MULTI_OK',
        wait: 3
      })
    };
  };

  const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
  await proxy.init();

  // combo_31 has 2 slots: slot-combo-1 (28951, quota 5) and slot-combo-2 (9041, quota 5) -> total 10 capacity
  const orders = [];
  for (let i = 0; i < 15; i++) {
    const o = await proxy.createOrder({ gameId: 'combo_31' });
    orders.push(o.order);
  }

  // Fire 15 concurrent requests across all orders
  const results = await Promise.all(orders.map(o => proxy.fetchGuardCode(o.orderId)));

  const successes = results.filter(r => r.ok);
  const outOfQuotas = results.filter(r => r.error === 'OUT_OF_QUOTA');

  assert.equal(successes.length, 10, 'Exactly 10 requests should succeed across 2 slots');
  assert.equal(outOfQuotas.length, 5, '5 requests exceeding aggregate capacity must fail with OUT_OF_QUOTA');

  const slot1 = proxy.slots.find(s => s.id === 'slot-combo-1');
  const slot2 = proxy.slots.find(s => s.id === 'slot-combo-2');

  assert.equal(slot1.timestamps.length, 5, 'Slot 1 must have exactly 5 timestamps');
  assert.equal(slot2.timestamps.length, 5, 'Slot 2 must have exactly 5 timestamps');
  assert.equal(queriedYzids.filter(y => y === '28951').length, 5, 'Slot 1 yzid queried exactly 5 times');
  assert.equal(queriedYzids.filter(y => y === '9041').length, 5, 'Slot 2 yzid queried exactly 5 times');
});

test('13. Chinese Error Translation and Zero Chinese Character Leakage', async () => {
  const testCases = [
    {
      upstreamMsg: '租用记录不存在，请刷新页面后重试',
      expectedKeyword: 'Đơn hàng chưa được kích hoạt'
    },
    {
      upstreamMsg: '卡密已过期或不存在',
      expectedKeyword: 'Tài khoản hiện đang bảo trì'
    },
    {
      upstreamMsg: '获取验证码过于频繁，请稍后再试',
      expectedKeyword: 'Thao tác quá nhanh'
    },
    {
      upstreamMsg: '未知系统异常错误 500',
      expectedKeyword: 'Hệ thống Steam đang bận'
    }
  ];

  for (const tc of testCases) {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        msg: tc.upstreamMsg,
        data: '',
        url: '',
        wait: 3
      })
    });

    const proxy = new SteamGuardProxy({ fetchFn: mockFetch });
    await proxy.init();

    const orderRes = await proxy.createOrder({ gameId: 'god_of_war' });
    const guardRes = await proxy.fetchGuardCode(orderRes.order.orderId);

    assert.equal(guardRes.ok, false);
    assert.equal(guardRes.error, 'UPSTREAM_ERROR');
    assert.ok(guardRes.message.includes(tc.expectedKeyword));
    assert.equal(/[\u4e00-\u9fa5]/.test(guardRes.message), false, `Zero Chinese chars leaked in: ${guardRes.message}`);
  }

  // Direct unit verification of translateUpstreamError helper
  assert.equal(translateUpstreamError(null).includes('liên hệ Admin'), true);
  assert.equal(/[\u4e00-\u9fa5]/.test(translateUpstreamError('测试中文错误')), false);
});

test('14. Safe JSON Parsing on null and Malformed Payloads on HTTP Endpoints', async () => {
  const testServer = server;
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. POST /api/steam/guard with 'null' body
    const nullGuardRes = await fetch(`${baseUrl}/api/steam/guard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    });
    assert.equal(nullGuardRes.status, 400, 'Sending null to guard must return 400 Bad Request');
    const nullGuardData = await nullGuardRes.json();
    assert.equal(nullGuardData.error, 'MISSING_ORDER_ID');

    // 2. POST /api/steam/checkout with 'null' body
    const nullCheckoutRes = await fetch(`${baseUrl}/api/steam/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    });
    assert.equal(nullCheckoutRes.status, 400, 'Sending null to checkout must return 400 Bad Request');
    const nullCheckoutData = await nullCheckoutRes.json();
    assert.equal(nullCheckoutData.error, 'INVALID_REQUEST');

    // 3. POST /api/steam/guard with malformed JSON
    const malformedGuardRes = await fetch(`${baseUrl}/api/steam/guard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid_json_string:'
    });
    assert.equal(malformedGuardRes.status, 400, 'Sending invalid JSON to guard must return 400 Bad Request');
    const malformedGuardData = await malformedGuardRes.json();
    assert.equal(malformedGuardData.error, 'BAD_REQUEST');

    // 4. POST /api/steam/checkout with malformed JSON
    const malformedCheckoutRes = await fetch(`${baseUrl}/api/steam/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid_json_string:'
    });
    assert.equal(malformedCheckoutRes.status, 400, 'Sending invalid JSON to checkout must return 400 Bad Request');
    const malformedCheckoutData = await malformedCheckoutRes.json();
    assert.equal(malformedCheckoutData.error, 'BAD_REQUEST');

    // 5. POST /api/admin/reset-quota with 'null' body
    const nullResetRes = await fetch(`${baseUrl}/api/admin/reset-quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    });
    assert.equal(nullResetRes.status, 200, 'Sending null to reset-quota must return 200 without crashing');
    const nullResetData = await nullResetRes.json();
    assert.equal(nullResetData.ok, true);
  } finally {
    await new Promise(resolve => testServer.close(resolve));
  }
});
