// Cloudflare Pages Function: /api/steam/*
// Handles Steam Offline Catalog, Orders, Payments, and Steam Guard 2FA Retrieval

const UPSTREAM_ENDPOINT = 'https://a.zuhaox.cn/addons/cms/api/getEmail';
const USER_CARD = '21DVkRqH3S7KzN/QDp9MuxSTCefhYb5P0aha/vnfPnFXOa4ZpWyllsVPMqY33Au0XjnqvRj1mb/sZmTQnee4fA==';

const SLOTS = {
  combo_31: { account: 'whkzw21078', password: 'yamvd58819', yzid: '28951', title: 'Gói Siêu Combo: 31 Game Bom Tấn AAA', price: 100000 },
  god_of_war: { account: 'Aereww111', password: 'Aereww111', yzid: '18159', title: 'God of War: Ragnarök', price: 50000 },
  cod_mw: { account: 'h3z2k_mw4', password: 'vtr41_cod', yzid: '21810', title: 'Call of Duty: Modern Warfare III (MW4)', price: 50000 },
  cyberpunk_2077: { account: 'shuaihua20251001', password: '18621862', yzid: '28715', title: 'Cyberpunk 2077: Ultimate Edition', price: 50000 },
  spiderman_miles: { account: '5z8uk9iff', password: '5z8u43AA', yzid: '27630', title: "Marvel's Spider-Man: Miles Morales", price: 50000 },
  hitman_woa: { account: 'whkzw21078', password: 'yamvd58819', yzid: '28951', title: 'Hitman: World of Assassination', price: 50000 },
  onimusha: { account: 'xiaofang215', password: 'xiaofang215', yzid: '15052', title: 'Onimusha: Warlords', price: 50000 },
  brotato: { account: 'frq844042', password: 'frq844042', yzid: '13604', title: 'Brotato', price: 50000 },
  silent_hill: { account: 'Qingning0115', password: 'ojqzEE63', yzid: '9746', title: 'Silent Hill 2 Remake', price: 50000 },
  magicraft: { account: 'kwxmktz49', password: 'kwxmktz49', yzid: '10371', title: 'Magicraft', price: 50000 },
  stormgate: { account: 'vxl557811', password: 'vxl557811', yzid: '13594', title: 'Stormgate', price: 50000 }
};

const NUMERIC_MAP = {
  2322010: 'god_of_war',
  1938090: 'cod_mw',
  1091500: 'cyberpunk_2077',
  1817190: 'spiderman_miles',
  1659040: 'hitman_woa',
  761620: 'onimusha',
  289070: 'civ_6'
};

// Global in-memory orders cache per edge instance
const orderStore = new Map();
const lastGuardCalls = new Map();

function translateError(rawMsg) {
  if (!rawMsg || typeof rawMsg !== 'string') return 'Chưa nhận được mã từ Steam. Vui lòng thử lại sau giây lát.';
  if (rawMsg.includes('租用记录不存在')) return 'Đơn hàng chưa được kích hoạt hoặc đã hết hạn thuê. Vui lòng liên hệ Admin.';
  if (rawMsg.includes('卡密已过期') || rawMsg.includes('卡密不存在')) return 'Tài khoản hiện đang bảo trì. Vui lòng liên hệ Admin để đổi tài khoản mới.';
  if (rawMsg.includes('频繁')) return 'Thao tác quá nhanh. Vui lòng chờ 3 giây trước khi lấy lại mã.';
  if (rawMsg.includes('验证码') || rawMsg.includes('获取失败') || rawMsg.includes('未收到')) {
    return 'Chưa nhận được mã xác nhận mới từ Steam. Hãy chắc chắn bạn đã bấm "Đăng nhập" trên Steam PC rồi thử lại.';
  }
  if (/[\u4e00-\u9fa5]/.test(rawMsg)) return 'Hệ thống Steam đang bận hoặc tài khoản đang cập nhật, vui lòng thử lại sau.';
  return rawMsg;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // 1. POST /api/steam/checkout
  if (path === '/api/steam/checkout' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const rawId = body.gameId || 'combo_31';
      const resolvedId = NUMERIC_MAP[rawId] || rawId;
      const slot = SLOTS[resolvedId] || SLOTS.combo_31;
      const price = resolvedId === 'combo_31' ? 100000 : (slot.price || 50000);

      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const orderId = `VTCH-OFF-${rand}`;

      const order = {
        orderId,
        gameId: resolvedId,
        title: slot.title,
        price,
        status: body.pending ? 'PENDING' : 'PAID',
        customerName: body.customerName || 'Khách mua game',
        createdAt: Date.now(),
        account: slot.account,
        password: slot.password,
        slotId: resolvedId,
        paymentInfo: {
          bank: 'MB',
          bankName: 'MB Bank (Quân Đội)',
          account: '0000125042003',
          name: 'NGUYEN VAN KIEN',
          amount: price,
          memo: orderId,
          qrUrl: `https://img.vietqr.io/image/MB-0000125042003-compact2.png?amount=${price}&addInfo=${orderId}&accountName=NGUYEN%20VAN%20KIEN`
        }
      };

      orderStore.set(orderId, order);

      // Sanitize output for pending orders
      const clientOrder = { ...order };
      if (clientOrder.status === 'PENDING') {
        delete clientOrder.account;
        delete clientOrder.password;
      }

      return jsonResponse({ ok: true, order: clientOrder });
    } catch (e) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', message: e.message }, 500);
    }
  }

  // 2. GET /api/steam/orders/:orderId
  if (path.startsWith('/api/steam/orders/')) {
    const orderId = path.replace('/api/steam/orders/', '').trim();
    const order = orderStore.get(orderId);
    if (!order) {
      return jsonResponse({ ok: false, error: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng' }, 404);
    }
    const clientOrder = { ...order };
    if (clientOrder.status === 'PENDING') {
      delete clientOrder.account;
      delete clientOrder.password;
    }
    return jsonResponse({ ok: true, order: clientOrder });
  }

  // 3. POST /api/steam/simulate-payment
  if (path === '/api/steam/simulate-payment' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const { orderId } = body;
      if (!orderId) return jsonResponse({ ok: false, message: 'Thiếu orderId' }, 400);

      let order = orderStore.get(orderId);
      if (!order) {
        // Create if missing
        const slot = SLOTS.god_of_war;
        order = {
          orderId,
          gameId: 'god_of_war',
          title: slot.title,
          price: 50000,
          status: 'PAID',
          customerName: 'Khách trải nghiệm',
          createdAt: Date.now(),
          account: slot.account,
          password: slot.password,
          slotId: 'god_of_war',
          paymentInfo: { bank: 'MB', account: '0000125042003', name: 'NGUYEN VAN KIEN' }
        };
      }
      order.status = 'PAID';
      orderStore.set(orderId, order);
      return jsonResponse({ ok: true, order });
    } catch (e) {
      return jsonResponse({ ok: false, message: e.message }, 500);
    }
  }

  // 4. POST /api/steam/guard
  if (path === '/api/steam/guard' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const { orderId } = body;
      if (!orderId) return jsonResponse({ ok: false, message: 'Thiếu orderId' }, 400);

      const order = orderStore.get(orderId);
      if (order && order.status !== 'PAID') {
        return jsonResponse({ ok: false, error: 'ORDER_NOT_PAID', message: 'Đơn hàng chưa hoàn tất thanh toán' }, 402);
      }

      // Check 3-second cooldown
      const now = Date.now();
      const lastCall = lastGuardCalls.get(orderId) || 0;
      if (now - lastCall < 3000) {
        const remaining = Math.ceil((3000 - (now - lastCall)) / 1000);
        return jsonResponse({ ok: false, error: 'COOLDOWN_ACTIVE', message: `Vui lòng đợi ${remaining}s trước khi lấy lại mã.` }, 429);
      }
      lastGuardCalls.set(orderId, now);

      const slotKey = order?.slotId || order?.gameId || 'combo_31';
      const slot = SLOTS[slotKey] || SLOTS.combo_31;

      // Call upstream
      const upstreamRes = await fetch(UPSTREAM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': `userCard=${USER_CARD}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: new URLSearchParams({ yzid: String(slot.yzid) }).toString()
      });

      const data = await upstreamRes.json().catch(() => null);
      if (data && data.code === 1 && data.data) {
        return jsonResponse({
          ok: true,
          code: String(data.data).trim(),
          remainingCalls: 5,
          slotRotated: false
        });
      }

      const msg = translateError(data?.msg);
      return jsonResponse({ ok: false, error: 'UPSTREAM_ERROR', message: msg }, 502);
    } catch (e) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', message: 'Không thể kết nối máy chủ Steam Guard.' }, 500);
    }
  }

  return jsonResponse({ ok: false, message: 'Not Found' }, 404);
}
