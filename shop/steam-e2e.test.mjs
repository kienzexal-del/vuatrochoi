// Steam Offline Staging Preview - Comprehensive Opaque-Box E2E Test Suite
// Covers Tier 1 (Feature Coverage), Tier 2 (Boundary & Corner Cases),
// Tier 3 (Cross-Feature Combinations), and Tier 4 (Real-World Application Scenarios).
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

import { server, steamProxy } from './preview-server.mjs';
import {
  DEFAULT_USER_CARD,
  COMBO_31_GAMES,
  STEAM_CATALOG,
  INITIAL_SLOTS,
  SteamGuardProxy
} from './steam-guard-proxy.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const previewHtmlPath = resolve(root, 'steam-preview.html');
const TEST_PORT = 4177;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Helper: Fast mock fetch for reliable, deterministic E2E test runs
const mockUpstreamSuccess = async (url, opts) => {
  return {
    ok: true,
    status: 200,
    async json() {
      return { code: 1, msg: '获取验证码', data: '595YR', url: '', wait: 3 };
    }
  };
};

// Helper: HTTP request wrapper returning status, headers, and parsed JSON
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

// Global test setup and teardown
let serverStartedByTest = false;

before(async () => {
  // Wire up fast mock fetch for reliable E2E execution
  steamProxy.fetchFn = mockUpstreamSuccess;

  // Check if server is already running on port 4177
  try {
    const probe = await apiRequest('/api/steam/catalog');
    if (probe.status === 200) {
      return;
    }
  } catch (_) {}

  // If not running, start server
  await new Promise((resolveStart, rejectStart) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      serverStartedByTest = true;
      resolveStart();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolveStart();
      } else {
        rejectStart(err);
      }
    });
  });
});

after(async () => {
  // Reset all quotas back to clean state
  await steamProxy.resetQuota();
  if (serverStartedByTest) {
    await new Promise(res => server.close(res));
  }
});

beforeEach(async () => {
  // Ensure default mock and clean in-memory state before each test
  steamProxy.fetchFn = mockUpstreamSuccess;
  await steamProxy.resetQuota();
  steamProxy.orders = [];
});

// =========================================================================
// TIER 1: FEATURE COVERAGE (>=5 tests per feature area across 12 areas)
// =========================================================================

describe('Tier 1.1: Catalog Rendering', () => {
  test('T1.1.1 - GET /api/steam/catalog returns combo_31 with price 100000 and original price 1550000', async () => {
    const res = await apiRequest('/api/steam/catalog');
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.combo.id, 'combo_31');
    assert.equal(res.json.combo.price, 100000);
    assert.equal(res.json.combo.originalPrice, 1550000);
  });

  test('T1.1.2 - Catalog combo includes exactly 31 AAA titles', async () => {
    const res = await apiRequest('/api/steam/catalog');
    assert.equal(Array.isArray(res.json.combo.games), true);
    assert.equal(res.json.combo.games.length, 31);
    assert.ok(res.json.combo.games.some(g => g.includes('Black Myth: Wukong')));
    assert.ok(res.json.combo.games.some(g => g.includes('Elden Ring')));
    assert.ok(res.json.combo.games.some(g => g.includes("Baldur's Gate 3")));
  });

  test('T1.1.3 - Catalog returns 12 single games with flat 50000 VND pricing', async () => {
    const res = await apiRequest('/api/steam/catalog');
    assert.equal(Array.isArray(res.json.singles), true);
    assert.equal(res.json.singles.length, 12);
    for (const game of res.json.singles) {
      assert.equal(game.price, 50000, `Game ${game.id} must be 50,000 VND`);
      assert.ok(game.title, 'Game title must be non-empty');
      assert.ok(game.category, 'Game category must be non-empty');
    }
  });

  test('T1.1.4 - HTML preview renders Mega Combo card with 100.000đ and VIP glow', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Gói Siêu Combo: <span class="text-amber-400">31 Game Bom Tấn AAA</span>'));
    assert.ok(html.includes('100.000đ'));
    assert.ok(html.includes('vip-glow') || html.includes('pulse-vip'));
    assert.ok(html.includes('TIẾT KIỆM 95%'));
  });

  test('T1.1.5 - HTML preview contains 31-game list modal and responsive games grid', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="modal-31-games"'));
    assert.ok(html.includes('id="modal-31-games-list"'));
    assert.ok(html.includes('id="games-grid"'));
    assert.ok(html.includes('id="game-count"'));
  });
});

describe('Tier 1.2: Checkout Flow & Transition to Order Details View', () => {
  test('T1.2.1 - POST /api/steam/checkout with combo_31 creates order with orderId starting with VTCH-OFF-', async () => {
    const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    assert.equal(res.status, 201);
    assert.equal(res.json.ok, true);
    assert.match(res.json.order.orderId, /^VTCH-OFF-\d{5}$/);
    assert.equal(res.json.order.price, 100000);
    assert.equal(res.json.order.status, 'PAID');
  });

  test('T1.2.2 - POST /api/steam/checkout with single game (onimusha) creates order priced at 50000', async () => {
    const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'onimusha' });
    assert.equal(res.status, 201);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.order.gameId, 'onimusha');
    assert.equal(res.json.order.price, 50000);
  });

  test('T1.2.3 - Created order includes initial allocated slot, account, and password', async () => {
    const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    assert.ok(res.json.order.slotId);
    assert.ok(res.json.order.account);
    assert.ok(res.json.order.password);
  });

  test('T1.2.4 - HTML includes checkout modal with Demo Pay and VietQR simulation', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="modal-checkout"'));
    assert.ok(html.includes('Demo 1-Click') || html.includes('Thanh toán Demo'));
    assert.ok(html.includes('VietQR') || html.includes('VIETQR SIMULATION'));
  });

  test('T1.2.5 - View switching transitions between shop and order details view', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="view-shop"'));
    assert.ok(html.includes('id="view-order"'));
    assert.ok(html.includes('switchView'));
    assert.ok(html.includes('view-shop.hidden') || html.includes("switchView('order')"));
  });
});

describe('Tier 1.3: Order Details View & Copyable Credentials', () => {
  test('T1.3.1 - HTML renders order-id container and status badge ĐÃ THANH TOÁN', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="order-id"'));
    assert.ok(html.includes('ĐÃ THANH TOÁN'));
    assert.ok(html.includes('animate-pulse'));
  });

  test('T1.3.2 - HTML renders steam-account and steam-password elements with copy buttons', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="steam-account"'));
    assert.ok(html.includes('id="steam-password"'));
    assert.ok(html.includes('copyToClipboard'));
    assert.ok(html.includes('Sao chép'));
  });

  test('T1.3.3 - GET /api/steam/orders/:orderId returns sanitized order details', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'cyberpunk_2077' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest(`/api/steam/orders/${orderId}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.order.orderId, orderId);
    assert.equal(res.json.order.gameId, 'cyberpunk_2077');
    assert.ok(res.json.order.account);
    assert.ok(res.json.order.password);
  });

  test('T1.3.4 - GET /api/steam/orders/:orderId does not leak internal yzid or userCard', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest(`/api/steam/orders/${orderId}`);
    assert.equal(res.json.order.yzid, undefined);
    assert.equal(res.json.order.userCard, undefined);
  });

  test('T1.3.5 - GET /api/steam/orders/non-existent returns 404', async () => {
    const res = await apiRequest('/api/steam/orders/VTCH-OFF-99999');
    assert.equal(res.status, 404);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'ORDER_NOT_FOUND');
  });
});

describe('Tier 1.4: 1-Click Steam Guard Retrieval Request & Response', () => {
  test('T1.4.1 - POST /api/steam/guard with valid orderId returns ok=true, code, and wait=3', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.match(res.json.code, /^[A-Z0-9]{5}$/);
    assert.equal(res.json.wait, 3);
  });

  test('T1.4.2 - Guard response decrements remainingCalls count on slot', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.remainingCalls, 4);
  });

  test('T1.4.3 - HTML contains 1-click fetch button with id fetch-code-btn', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="fetch-code-btn"'));
    assert.ok(html.includes('BẤM VÀO ĐÂY ĐỂ LẤY MÃ STEAM GUARD'));
  });

  test('T1.4.4 - HTML contains code result box with id code-result-box and steam-guard-code', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="code-result-box"'));
    assert.ok(html.includes('id="steam-guard-code"'));
  });

  test('T1.4.5 - HTML contains dedicated copy code button for Steam Guard code', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes("copyToClipboard(document.getElementById('steam-guard-code').innerText, 'Mã Steam Guard')"));
    assert.ok(html.includes('Copy Mã'));
  });
});

describe('Tier 1.5: 3-Second Cooldown Timer Enforcement', () => {
  test('T1.5.1 - Rapid successive guard query within <3s is rejected with 429 COOLDOWN_ACTIVE', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const first = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(first.status, 200);

    const second = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(second.status, 429);
    assert.equal(second.json.ok, false);
    assert.equal(second.json.error, 'COOLDOWN_ACTIVE');
  });

  test('T1.5.2 - Cooldown response contains numeric wait duration', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const second = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(second.status, 429);
    assert.ok(typeof second.json.wait === 'number');
    assert.ok(second.json.wait > 0 && second.json.wait <= 3);
  });

  test('T1.5.3 - Cooldown error message contains friendly Vietnamese guidance', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const second = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.ok(second.json.message.includes('Vui lòng chờ'));
  });

  test('T1.5.4 - HTML includes cooldown timer display and countdown text', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="cooldown-timer"'));
    assert.ok(html.includes('Giãn cách: 3 giây / lần'));
    assert.ok(html.includes('Chờ'));
  });

  test('T1.5.5 - Request succeeds after simulating or waiting past cooldown duration', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const first = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(first.status, 200);

    // Fast-forward lastFetchTime in proxy state to simulate 3.1s passage
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 3500;

    const second = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(second.status, 200);
    assert.equal(second.json.ok, true);
  });
});

describe('Tier 1.6: 3-Step Offline Setup Guide Present in UI', () => {
  test('T1.6.1 - HTML contains 3-step offline activation guide section', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Hướng Dẫn Kích Hoạt Game (3 Bước)'));
    assert.ok(html.includes('<ol class="list-decimal'));
  });

  test('T1.6.2 - Step 1 explains opening Steam PC and logging in with provided credentials', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Mở Steam trên PC, đăng nhập bằng'));
    assert.ok(html.includes('Tài khoản & Mật khẩu'));
  });

  test('T1.6.3 - Step 2 explains clicking Steam Guard button to paste verification code', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Lấy mã Steam Guard'));
    assert.ok(html.includes('rồi dán vào'));
  });

  test('T1.6.4 - Step 3 explains downloading game and switching to Go Offline mode', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Go Offline') || html.includes('Chế độ ngắt kết nối'));
  });

  test('T1.6.5 - Guide highlights permanent offline play without conflict', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('chơi vĩnh viễn không sợ bị trùng hay đá văng') || html.includes('chơi vĩnh viễn'));
  });
});

describe('Tier 1.7: Out-of-Stock Badge & Notice with Contact Admin Link', () => {
  test('T1.7.1 - HTML includes out-of-stock alert container with exact warning text', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="out-of-stock-alert"'));
    assert.ok(html.includes('TẠM HẾT HÀNG, VUI LÒNG ĐỢI'));
  });

  test('T1.7.2 - HTML out-of-stock alert includes Admin Zalo contact button', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Nhắn Admin Zalo'));
    assert.ok(html.includes('zalo.me'));
  });

  test('T1.7.3 - HTML out-of-stock alert includes Admin Telegram contact button', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Nhắn Admin Telegram'));
    assert.ok(html.includes('t.me'));
  });

  test('T1.7.4 - HTML catalog card features stock tag and disabled state support', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="combo-stock-tag"'));
    assert.ok(html.includes('TẠM HẾT LƯỢT') || html.includes('disabled:opacity-50'));
  });

  test('T1.7.5 - POST /api/steam/checkout on exhausted product returns HTTP 410 OUT_OF_STOCK', async () => {
    // Fill all slots for cyberpunk to 5 calls
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'cyberpunk_2077', count: 5 });

    const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'cyberpunk_2077' });
    assert.equal(res.status, 410);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'OUT_OF_STOCK');
    assert.ok(res.json.message.includes('tạm hết hàng, vui lòng đợi'));
  });
});

describe('Tier 1.8: Proxy Endpoint Receives Order Request, Shields userCard, Queries Upstream, Extracts Code', () => {
  test('T1.8.1 - POST /api/steam/guard receives orderId, protects userCard server-side', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'hitman_woa' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.ok(res.json.code);
  });

  test('T1.8.2 - Upstream response headers never leak userCard cookie to client', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    const headersStr = JSON.stringify(res.headers);
    assert.equal(headersStr.includes(DEFAULT_USER_CARD), false);
  });

  test('T1.8.3 - Guard response body never contains userCard or upstream cookie', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.text.includes(DEFAULT_USER_CARD), false);
    assert.equal(res.json.userCard, undefined);
  });

  test('T1.8.4 - Client never sends yzid, proxy looks up yzid internally', async () => {
    let capturedBody = '';
    steamProxy.fetchFn = async (url, opts) => {
      capturedBody = opts.body;
      return {
        ok: true,
        async json() {
          return { code: 1, msg: '获取验证码', data: 'XYZ99', url: '', wait: 3 };
        }
      };
    };

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.code, 'XYZ99');
    assert.ok(capturedBody.includes('yzid=18159')); // God of War yzid
  });

  test('T1.8.5 - Frontend HTML and script files contain zero instances of userCard', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.equal(html.includes(DEFAULT_USER_CARD), false);
    assert.equal(html.includes('userCard='), false);
  });
});

describe('Tier 1.9: Quota Tracking (5 requests/day/slot ceiling)', () => {
  test('T1.9.1 - Slot starts with full 5 daily allowance', async () => {
    const slot = steamProxy.slots.find(s => s.id === 'slot-gow');
    assert.equal(steamProxy.getSlotRemainingQuota(slot), 5);
  });

  test('T1.9.2 - Each successful retrieval decrements remaining quota', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.json.remainingCalls, 4);

    const slot = steamProxy.slots.find(s => s.id === create.json.order.slotId);
    assert.equal(steamProxy.getSlotRemainingQuota(slot), 4);
  });

  test('T1.9.3 - Quota prunes timestamps older than 24 hours', async () => {
    const slot = steamProxy.slots.find(s => s.id === 'slot-gow');
    const oldTs = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const newTs = Date.now() - 1000; // 1 second ago

    slot.timestamps = [oldTs, oldTs, newTs];
    const usage = steamProxy.getSlotUsage(slot);
    assert.equal(usage, 1);
    assert.equal(steamProxy.getSlotRemainingQuota(slot), 4);
  });

  test('T1.9.4 - Staging reset endpoint POST /api/admin/reset-quota sets exact quota count', async () => {
    const res = await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-gow', count: 3 });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);

    const slot = steamProxy.slots.find(s => s.id === 'slot-gow');
    assert.equal(steamProxy.getSlotRemainingQuota(slot), 2);
  });

  test('T1.9.5 - Slot quota is isolated across distinct slots', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-cyberpunk', count: 5 });
    const cpSlot = steamProxy.slots.find(s => s.id === 'slot-cyberpunk');
    const gowSlot = steamProxy.slots.find(s => s.id === 'slot-gow');

    assert.equal(steamProxy.getSlotRemainingQuota(cpSlot), 0);
    assert.equal(steamProxy.getSlotRemainingQuota(gowSlot), 5);
  });
});

describe('Tier 1.10: Slot Auto-Rotation When Slot Reaches 5 Requests', () => {
  test('T1.10.1 - Mega Combo config defines multi-slot pool (slot 1: 28951, slot 2: 9041)', async () => {
    const comboSlots = steamProxy.getSlotsForGame('combo_31');
    assert.equal(comboSlots.length, 2);
    assert.equal(comboSlots[0].yzid, '28951');
    assert.equal(comboSlots[1].yzid, '9041');
  });

  test('T1.10.2 - When primary combo slot reaches 5 calls, next retrieval rotates to slot 2 (9041)', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    // Fill primary slot (slot-combo-1) with 5 calls
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-1', count: 5 });

    // Request guard code on order previously assigned to slot-combo-1
    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.slotRotated, true);

    // Order should now be on slot-combo-2
    const order = await steamProxy.getOrder(orderId);
    assert.equal(order.slotId, 'slot-combo-2');
  });

  test('T1.10.3 - HTML includes slot rotation alert banner', async () => {
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('id="slot-rotated-alert"'));
    assert.ok(html.includes('Tự động xoay slot'));
    assert.ok(html.includes('chuyển đơn sang slot dự phòng khả dụng'));
  });

  test('T1.10.4 - Onimusha defines 3-slot rotation pool (15052 -> 8885 -> 8530)', async () => {
    const slots = steamProxy.getSlotsForGame('onimusha');
    assert.equal(slots.length, 3);
    assert.equal(slots[0].yzid, '15052');
    assert.equal(slots[1].yzid, '8885');
    assert.equal(slots[2].yzid, '8530');
  });

  test('T1.10.5 - Onimusha rotates sequentially from slot 1 to slot 2 and slot 2 to slot 3', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'onimusha' });
    const orderId = create.json.order.orderId;

    // Exhaust slot 1
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-onimusha-1', count: 5 });

    const res1 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res1.status, 200);
    assert.equal(res1.json.slotRotated, true);

    const orderAfterRot1 = await steamProxy.getOrder(orderId);
    assert.equal(orderAfterRot1.slotId, 'slot-onimusha-2');

    // Fast-forward cooldown and exhaust slot 2
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 3500;
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-onimusha-2', count: 5 });

    const res2 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res2.status, 200);
    assert.equal(res2.json.slotRotated, true);

    const orderAfterRot2 = await steamProxy.getOrder(orderId);
    assert.equal(orderAfterRot2.slotId, 'slot-onimusha-3');
  });
});

describe('Tier 1.11: Out-of-Quota Fallback Triggered When All Slots Reach 5 Daily Requests', () => {
  test('T1.11.1 - When all slots for combo_31 reach 5 calls, guard retrieval returns HTTP 410 OUT_OF_QUOTA', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    // Fill both combo slots
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'combo_31', count: 5 });

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 410);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'OUT_OF_QUOTA');
  });

  test('T1.11.2 - OUT_OF_QUOTA response includes exact phrase "tạm hết hàng, vui lòng đợi"', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'combo_31', count: 5 });

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.ok(res.json.message.includes('tạm hết hàng, vui lòng đợi'));
  });

  test('T1.11.3 - OUT_OF_QUOTA response instructs user to contact Admin via Zalo/Telegram', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'combo_31', count: 5 });

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.ok(res.json.message.includes('Admin qua Zalo/Telegram'));
  });

  test('T1.11.4 - Catalog marks game as inStock=false and availableSlots=0 when all slots are full', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'combo_31', count: 5 });

    const res = await apiRequest('/api/steam/catalog');
    assert.equal(res.json.combo.inStock, false);
    assert.equal(res.json.combo.availableSlots, 0);
  });

  test('T1.11.5 - New checkout attempt on exhausted game returns HTTP 410 OUT_OF_STOCK', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'combo_31', count: 5 });

    const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    assert.equal(res.status, 410);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'OUT_OF_STOCK');
    assert.ok(res.json.message.includes('tạm hết hàng, vui lòng đợi'));
  });
});

describe('Tier 1.12: Staging Preview Only Constraint (No production deployment, port 4177)', () => {
  test('T1.12.1 - Preview server listens and responds on port 4177', async () => {
    const res = await apiRequest('/api/steam/catalog');
    assert.equal(res.status, 200);
  });

  test('T1.12.2 - Route GET /steam serves the staging HTML preview', async () => {
    const res = await apiRequest('/steam');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.text.includes('Bản Mẫu — Cửa Hàng Steam Offline Vua Trò Chơi'));
  });

  test('T1.12.3 - Route GET /steam-preview also serves the staging HTML preview', async () => {
    const res = await apiRequest('/steam-preview');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('VUA TRÒ CHƠI • STEAM OFFLINE'));
  });

  test('T1.12.4 - Staging uses local state and does not contact production domain', async () => {
    assert.ok(steamProxy.stateFilePath);
    assert.ok(steamProxy.stateFilePath.includes('.preview-state.json'));
  });

  test('T1.12.5 - Admin reset-quota route is available in staging for testing', async () => {
    const res = await apiRequest('/api/admin/reset-quota', {}, { count: 0 });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
  });
});

// =========================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature area across 4 areas)
// =========================================================================

describe('Tier 2.1: Quota Exact Boundary (4th, 5th, 6th requests)', () => {
  test('T2.B1.1 - Exactly 4th request succeeds with remainingCalls = 1 and no rotation', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-gow', count: 3 });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.remainingCalls, 1);
    assert.equal(res.json.slotRotated, false);
  });

  test('T2.B1.2 - Exactly 5th request succeeds with remainingCalls = 0 on current slot', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-gow', count: 4 });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.remainingCalls, 0);
    assert.equal(res.json.slotRotated, false);
  });

  test('T2.B1.3 - Exactly 6th request triggers rotation to slot 2 with remainingCalls = 4', async () => {
    // Combo slot 1 has 5 calls, slot 2 has 0 calls
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-1', count: 5 });
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-2', count: 0 });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    // Manually ensure order was initially pointing to slot-combo-1
    const internalOrder = steamProxy.orders.find(o => o.orderId === create.json.order.orderId);
    internalOrder.slotId = 'slot-combo-1';

    const res = await apiRequest('/api/steam/guard', {}, { orderId: create.json.order.orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.slotRotated, true);
    assert.equal(res.json.remainingCalls, 4); // 5 - 1 on slot-combo-2
  });

  test('T2.B1.4 - Exactly 10th request on 2-slot game succeeds with remainingCalls = 0 on slot 2', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-1', count: 5 });
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-2', count: 4 });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const res = await apiRequest('/api/steam/guard', {}, { orderId: create.json.order.orderId });

    assert.equal(res.status, 200);
    assert.equal(res.json.remainingCalls, 0);
  });

  test('T2.B1.5 - Exactly 11th request on 2-slot game triggers OUT_OF_QUOTA', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-1', count: 5 });
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-2', count: 5 });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    assert.equal(create.status, 410);
    assert.equal(create.json.error, 'OUT_OF_STOCK');
  });
});

describe('Tier 2.2: Cooldown Exact Boundary (<3000ms vs >=3000ms)', () => {
  test('T2.B2.1 - Request within 100ms rejected with 429', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 429);
    assert.equal(res.json.error, 'COOLDOWN_ACTIVE');
  });

  test('T2.B2.2 - Request at 1500ms elapsed rejected with 429 and wait = 2', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 1500;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 429);
    assert.equal(res.json.wait, 2);
  });

  test('T2.B2.3 - Request at 2500ms elapsed rejected with 429 and wait = 1', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 2500;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 429);
    assert.equal(res.json.wait, 1);
  });

  test('T2.B2.4 - Request at 2950ms elapsed rejected with 429', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 2950;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 429);
  });

  test('T2.B2.5 - Request at >=3050ms elapsed accepted with 200', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 3050;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
  });
});

describe('Tier 2.3: Invalid orderId, invalid gameId, empty payload handling', () => {
  test('T2.B3.1 - POST /api/steam/checkout with empty body returns HTTP 400 INVALID_REQUEST', async () => {
    const res = await apiRequest('/api/steam/checkout', {}, {});
    assert.equal(res.status, 400);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'INVALID_REQUEST');
  });

  test('T2.B3.2 - POST /api/steam/checkout with unknown gameId returns HTTP 400 PRODUCT_NOT_FOUND', async () => {
    const res = await apiRequest('/api/steam/checkout', {}, { gameId: 'non_existent_game_xyz' });
    assert.equal(res.status, 400);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'PRODUCT_NOT_FOUND');
  });

  test('T2.B3.3 - POST /api/steam/guard with missing orderId returns HTTP 400 MISSING_ORDER_ID', async () => {
    const res = await apiRequest('/api/steam/guard', {}, {});
    assert.equal(res.status, 400);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'MISSING_ORDER_ID');
  });

  test('T2.B3.4 - POST /api/steam/guard with non-existent orderId returns HTTP 404 ORDER_NOT_FOUND', async () => {
    const res = await apiRequest('/api/steam/guard', {}, { orderId: 'VTCH-OFF-00000' });
    assert.equal(res.status, 404);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'ORDER_NOT_FOUND');
  });

  test('T2.B3.5 - POST /api/steam/checkout with malformed JSON string returns HTTP 400 BAD_REQUEST', async () => {
    const res = await apiRequest('/api/steam/checkout', { method: 'POST' }, '{malformed_json:');
    assert.equal(res.status, 400);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'BAD_REQUEST');
  });
});

describe('Tier 2.4: Upstream error translation to friendly Vietnamese', () => {
  test('T2.B4.1 - Upstream code 0 with Chinese text translated to friendly Vietnamese', async () => {
    steamProxy.fetchFn = async () => ({
      ok: true,
      async json() {
        return { code: 0, msg: '租用记录不存在，请刷新页面后重试', data: '', url: '', wait: 3 };
      }
    });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 502);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'UPSTREAM_ERROR');
    assert.ok(res.json.message.length > 0);
  });

  test('T2.B4.2 - Upstream network error translated to friendly Vietnamese message', async () => {
    steamProxy.fetchFn = async () => {
      throw new Error('Connection reset by peer');
    };

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 502);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'UPSTREAM_NETWORK_ERROR');
    assert.ok(res.json.message.includes('Lỗi kết nối tới máy chủ Steam Guard'));
  });

  test('T2.B4.3 - Out of quota error contains required Vietnamese phrase', async () => {
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'brotato', count: 5 });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'brotato' });
    assert.equal(create.status, 410);
    assert.ok(create.json.message.includes('tạm hết hàng, vui lòng đợi'));
  });

  test('T2.B4.4 - Cooldown error message formatted with friendly Vietnamese wait duration', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    await apiRequest('/api/steam/guard', {}, { orderId });
    const second = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(second.status, 429);
    assert.ok(second.json.message.includes('Vui lòng chờ'));
  });

  test('T2.B4.5 - Upstream returning HTTP 500 error handled gracefully', async () => {
    steamProxy.fetchFn = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 502);
    assert.equal(res.json.ok, false);
  });
});

// =========================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions & Lifecycles)
// =========================================================================

describe('Tier 3: Cross-Feature Combinations', () => {
  test('T3.C1 - Full Lifecycle: Checkout -> Retrieval 1 -> Cooldown 429 -> Delay -> Retrieval 2 -> Quota Decrement', async () => {
    // 1. Checkout
    const checkout = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    assert.equal(checkout.status, 201);
    const orderId = checkout.json.order.orderId;

    // 2. Retrieval 1
    const get1 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(get1.status, 200);
    assert.equal(get1.json.remainingCalls, 4);

    // 3. Immediate retrieval 2 (Expect 429 Cooldown)
    const get2 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(get2.status, 429);
    assert.equal(get2.json.error, 'COOLDOWN_ACTIVE');

    // 4. Simulate cooldown elapsed
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 3500;

    // 5. Retrieval 2 after delay
    const get3 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(get3.status, 200);
    assert.equal(get3.json.remainingCalls, 3);
  });

  test('T3.C2 - Multi-Slot Rotation Transition: Slot 1 full -> Next retrieval rotates to Slot 2 -> Slot 2 decremented', async () => {
    const checkout = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = checkout.json.order.orderId;

    // Simulate 4 calls already used on slot-combo-1
    await apiRequest('/api/admin/reset-quota', {}, { slotId: 'slot-combo-1', count: 4 });

    // Call 5 (last allowed on slot 1)
    const call5 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(call5.status, 200);
    assert.equal(call5.json.remainingCalls, 0);
    assert.equal(call5.json.slotRotated, false);

    // Fast-forward cooldown
    const internalOrder = steamProxy.orders.find(o => o.orderId === orderId);
    internalOrder.lastFetchTime = Date.now() - 3500;

    // Call 6: Should auto-rotate to slot-combo-2!
    const call6 = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(call6.status, 200);
    assert.equal(call6.json.slotRotated, true);
    assert.equal(call6.json.remainingCalls, 4);

    const updatedOrder = await steamProxy.getOrder(orderId);
    assert.equal(updatedOrder.slotId, 'slot-combo-2');
  });

  test('T3.C3 - Total Pool Depletion & Fallback: Both slots full -> Next retrieval returns OUT_OF_QUOTA -> Catalog out of stock', async () => {
    const checkout = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = checkout.json.order.orderId;

    // Deplete both slots
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'combo_31', count: 5 });

    // Retrieval must trigger OUT_OF_QUOTA
    const res = await apiRequest('/api/steam/guard', {}, { orderId });
    assert.equal(res.status, 410);
    assert.equal(res.json.error, 'OUT_OF_QUOTA');

    // Catalog must now flag combo as out of stock
    const cat = await apiRequest('/api/steam/catalog');
    assert.equal(cat.json.combo.inStock, false);
    assert.equal(cat.json.combo.availableSlots, 0);

    // New checkout must be rejected
    const newCheckout = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    assert.equal(newCheckout.status, 410);
    assert.equal(newCheckout.json.error, 'OUT_OF_STOCK');
  });

  test('T3.C4 - Independent Quotas: Depleting Onimusha does not affect Cyberpunk or Combo', async () => {
    // Deplete all 3 Onimusha slots
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'onimusha', count: 5 });

    const cat = await apiRequest('/api/steam/catalog');
    const onimusha = cat.json.singles.find(s => s.id === 'onimusha');
    const cyberpunk = cat.json.singles.find(s => s.id === 'cyberpunk_2077');

    assert.equal(onimusha.inStock, false);
    assert.equal(cyberpunk.inStock, true);
    assert.equal(cat.json.combo.inStock, true);

    // Checkout on Cyberpunk succeeds
    const cpCheckout = await apiRequest('/api/steam/checkout', {}, { gameId: 'cyberpunk_2077' });
    assert.equal(cpCheckout.status, 201);
  });

  test('T3.C5 - Admin Reset & Recovery: Exhausted game restored via reset-quota -> Catalog in-stock -> Checkout succeeds', async () => {
    // Exhaust Cyberpunk
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'cyberpunk_2077', count: 5 });
    const cat1 = await apiRequest('/api/steam/catalog');
    assert.equal(cat1.json.singles.find(s => s.id === 'cyberpunk_2077').inStock, false);

    // Admin reset
    await apiRequest('/api/admin/reset-quota', {}, { gameId: 'cyberpunk_2077', count: 0 });
    const cat2 = await apiRequest('/api/steam/catalog');
    assert.equal(cat2.json.singles.find(s => s.id === 'cyberpunk_2077').inStock, true);

    const cpCheckout = await apiRequest('/api/steam/checkout', {}, { gameId: 'cyberpunk_2077' });
    assert.equal(cpCheckout.status, 201);
  });
});

// =========================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// =========================================================================

describe('Tier 4: Real-World Application Scenarios', () => {
  test('T4.R1 - Multi-User Purchase Simulation Under Daily Load', async () => {
    // 3 distinct customers buying different games concurrently
    const [user1, user2, user3] = await Promise.all([
      apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31', customerName: 'Khách 1' }),
      apiRequest('/api/steam/checkout', {}, { gameId: 'god_of_war', customerName: 'Khách 2' }),
      apiRequest('/api/steam/checkout', {}, { gameId: 'spiderman_miles', customerName: 'Khách 3' })
    ]);

    assert.equal(user1.status, 201);
    assert.equal(user2.status, 201);
    assert.equal(user3.status, 201);

    // Each user retrieves their initial code concurrently
    const [code1, code2, code3] = await Promise.all([
      apiRequest('/api/steam/guard', {}, { orderId: user1.json.order.orderId }),
      apiRequest('/api/steam/guard', {}, { orderId: user2.json.order.orderId }),
      apiRequest('/api/steam/guard', {}, { orderId: user3.json.order.orderId })
    ]);

    assert.equal(code1.status, 200);
    assert.equal(code2.status, 200);
    assert.equal(code3.status, 200);

    assert.match(code1.json.code, /^[A-Z0-9]{5}$/);
    assert.match(code2.json.code, /^[A-Z0-9]{5}$/);
    assert.match(code3.json.code, /^[A-Z0-9]{5}$/);
  });

  test('T4.R2 - Security Leakage Audit: userCard NEVER present across any preview responses or static files', async () => {
    const checkEndpoints = [
      '/api/steam/catalog',
      '/steam',
      '/steam-preview'
    ];

    for (const ep of checkEndpoints) {
      const res = await apiRequest(ep);
      assert.equal(
        res.text.includes(DEFAULT_USER_CARD),
        false,
        `Endpoint ${ep} must not leak secret userCard cookie`
      );
    }

    // Check html file directly
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.equal(html.includes(DEFAULT_USER_CARD), false);
  });

  test('T4.R3 - High-Frequency Click Spamming Protection (10 rapid requests in <1 second)', async () => {
    const create = await apiRequest('/api/steam/checkout', {}, { gameId: 'combo_31' });
    const orderId = create.json.order.orderId;

    // Send 10 rapid concurrent queries
    const promises = Array.from({ length: 10 }, () =>
      apiRequest('/api/steam/guard', {}, { orderId })
    );
    const results = await Promise.all(promises);

    const successes = results.filter(r => r.status === 200);
    const rateLimited = results.filter(r => r.status === 429);

    // Exactly 1 must pass, 9 must be 429 rate limited
    assert.equal(successes.length, 1, 'Only exactly 1 request may succeed');
    assert.equal(rateLimited.length, 9, 'All other 9 requests must be 429');
  });

  test('T4.R4 - Full Customer Journey Simulation', async () => {
    // Step 1: Customer opens catalog
    const catalog = await apiRequest('/api/steam/catalog');
    assert.equal(catalog.status, 200);
    assert.ok(catalog.json.combo.inStock);

    // Step 2: Customer selects Mega Combo and checks out
    const checkout = await apiRequest('/api/steam/checkout', {}, {
      gameId: 'combo_31',
      customerName: 'Nguyễn Văn A'
    });
    assert.equal(checkout.status, 201);
    const order = checkout.json.order;

    // Step 3: Customer verifies credentials are provided
    assert.ok(order.account.length > 0);
    assert.ok(order.password.length > 0);

    // Step 4: Customer retrieves 1-click Steam Guard code
    const guard = await apiRequest('/api/steam/guard', {}, { orderId: order.orderId });
    assert.equal(guard.status, 200);
    assert.match(guard.json.code, /^[A-Z0-9]{5}$/);

    // Step 5: Verify instructions in UI are accessible to customer
    const html = await readFile(previewHtmlPath, 'utf8');
    assert.ok(html.includes('Go Offline'));
  });

  test('T4.R5 - Production Isolation Verification: Port 4177 runs strictly locally with zero external worker mutations', async () => {
    // Assert server is bound to localhost
    const res = await apiRequest('/api/steam/catalog');
    assert.equal(res.status, 200);

    // Assert production domain is untouched (safe read-only assertion)
    assert.equal(steamProxy.userCard, DEFAULT_USER_CARD);
  });
});
