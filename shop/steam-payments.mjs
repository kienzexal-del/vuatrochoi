import {verifyGoogle} from './gis-sheets-worker.mjs';
import games from '../games/games.json';

const reply = (data, status = 200) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store'}
});
export function publicSteamOrder(row) {
  return {
    ...row, id: row.orderId,
    plan: row.gameId === 'combo_31' ? 'combo_31' : 'game_' + row.gameId,
    amount: row.price,
    title: row.gameId === 'combo_31' ? 'Gói Siêu Combo (31 Game Steam AAA)' :
      games.find(game => String(game.id) === String(row.gameId))?.name || 'Game Steam Offline',
    createdAt: row.createdAt?.includes('T') ? row.createdAt : row.createdAt?.replace(' ', 'T') + 'Z'
  };
}

const USER_CARD = '21DVkRqH3S7KzN/QDp9MuxSTCefhYb5P0aha/vnfPnFXOa4ZpWyllsVPMqY33Au0XjnqvRj1mb/sZmTQnee4fA==';
const UPSTREAM_ENDPOINT = 'https://a.zuhaox.cn/addons/cms/api/getEmail';

const ACCOUNT_TO_YZID = {
  'Qingning0115': '9746',
  '1636440': '9746',
  'silent_hill': '9746',
  'Aereww111': '18159',
  '2322010': '18159',
  'god_of_war': '18159',
  'whkzw21078': '28951',
  'whkzw21078_b': '9041',
  'combo_31': '28951',
  '1659040': '28951',
  'hitman_woa': '28951',
  'shuaihua20251001': '28715',
  '1091500': '28715',
  'cyberpunk_2077': '28715',
  '5z8uk9iff': '27630',
  '1817190': '27630',
  'spiderman_miles': '27630',
  'smzh44444': '21810',
  'h3z2k_mw4': '21810',
  '1938090': '21810',
  'cod_mw': '21810',
  'kbe140289': '18309',
  '3321460': '18309',
  'crimson_desert': '18309',
  'xiaofang215': '15052',
  'xiaofang215_2': '8885',
  'xiaofang215_3': '8530',
  '2638890': '15052',
  '761620': '15052',
  'onimusha': '15052',
  'frq844042': '13604',
  '1942280': '13604',
  'brotato': '13604',
  '289070': '12273',
  'civ_6': '12273',
  'civ6_vip': '12273',
  'kwxmktz49': '10371',
  '2103140': '10371',
  'magicraft': '10371',
  'vxl557811': '13594',
  '2012510': '13594',
  'stormgate': '13594'
};

function translateUpstreamError(rawMsg) {
  if (!rawMsg || typeof rawMsg !== 'string') {
    return 'Chưa nhận được mã từ Steam. Vui lòng thử lại sau giây lát.';
  }
  if (rawMsg.includes('租用记录不存在')) {
    return 'Đơn hàng chưa được kích hoạt hoặc đã hết hạn thuê. Vui lòng liên hệ Admin.';
  }
  if (rawMsg.includes('当日获取次数已用完') || rawMsg.includes('次数已用完')) {
    return 'Hạn mức lấy mã hôm nay của tài khoản này đã hết. Vui lòng liên hệ shop để hỗ trợ cấp slot mới.';
  }
  if (rawMsg.includes('卡密已过期') || rawMsg.includes('卡密不存在') || rawMsg.includes('过期') || rawMsg.includes('不存在')) {
    return 'Tài khoản hiện đang bảo trì. Vui lòng liên hệ Admin để đổi tài khoản mới.';
  }
  if (rawMsg.includes('频繁') || rawMsg.includes('过于频繁')) {
    return 'Thao tác quá nhanh. Vui lòng đợi 3 giây trước khi lấy lại mã.';
  }
  if (rawMsg.includes('密码错误') || rawMsg.includes('账号错误') || rawMsg.includes('封禁') || rawMsg.includes('冻结')) {
    return 'Tài khoản đang được cập nhật hoặc đổi mật khẩu. Vui lòng liên hệ Admin để được hỗ trợ.';
  }
  if (rawMsg.includes('验证码') || rawMsg.includes('获取失败') || rawMsg.includes('未收到')) {
    return 'Chưa nhận được mã xác nhận mới từ Steam. Hãy chắc chắn bạn đã bấm "Đăng nhập" trên Steam PC rồi thử lại.';
  }
  if (/[\u4e00-\u9fa5]/.test(rawMsg)) {
    return 'Hệ thống Steam đang bận hoặc tài khoản đang cập nhật, vui lòng thử lại sau giây lát.';
  }
  return rawMsg;
}

const guardCache = new Map(); // key: yzid, value: { code, timestamp }

async function handleSteamGuard(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const account = String(body.account || '').trim();
    const gameId = String(body.gameId || '').trim();
    const slotId = String(body.slotId || '').trim();
    const orderId = String(body.orderId || '').trim();

    let yzid = body.yzid;
    if (!yzid && account) yzid = ACCOUNT_TO_YZID[account];
    if (!yzid && gameId) yzid = ACCOUNT_TO_YZID[gameId];
    if (!yzid && slotId) yzid = ACCOUNT_TO_YZID[slotId];
    if (!yzid && orderId && env.STEAM_DB) {
      try {
        const row = await env.STEAM_DB.prepare(
          'SELECT s.username, o.product_id FROM steam_orders o LEFT JOIN steam_stock s ON s.order_id=o.id WHERE o.id=?'
        ).bind(orderId).first();
        if (row?.username) yzid = ACCOUNT_TO_YZID[row.username];
        if (!yzid && row?.product_id) yzid = ACCOUNT_TO_YZID[row.product_id];
      } catch {}
    }

    if (!yzid) {
      yzid = '9746';
    }

    // Anti-burn quota protection: Reuse code retrieved within 60 seconds without calling upstream
    const yzidKey = String(yzid);
    const cached = guardCache.get(yzidKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp < 60000)) {
      return Response.json({
        ok: true,
        code: cached.code,
        source: 'cache',
        account,
        remainingSec: Math.ceil((60000 - (now - cached.timestamp)) / 1000)
      }, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        }
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const upstreamRes = await fetch(UPSTREAM_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': `userCard=${USER_CARD}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: new URLSearchParams({ yzid: yzidKey }).toString()
    });
    clearTimeout(timer);

    const data = await upstreamRes.json().catch(() => null);
    if (data && data.code === 1 && data.data) {
      const code = String(data.data).trim();
      guardCache.set(yzidKey, { code, timestamp: Date.now() });
      return Response.json({
        ok: true,
        code,
        source: 'upstream',
        account
      }, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        }
      });
    }

    const errorMsg = translateUpstreamError(data?.msg);
    return Response.json({
      ok: false,
      error: 'UPSTREAM_NO_CODE',
      message: errorMsg,
      rawMsg: data?.msg
    }, {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: 'TIMEOUT_OR_NETWORK',
      message: 'Không thể kết nối máy chủ cấp mã lúc này. Vui lòng bấm thử lại.'
    }, {
      status: 504,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  }
}

export async function steamPaymentRoute(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/steam/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (url.pathname === '/api/steam/guard' && request.method === 'POST') {
    return handleSteamGuard(request, env);
  }

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
  if (url.pathname === '/api/steam/orders') {
    const {results} = await env.STEAM_DB.prepare(
      'SELECT id AS orderId,product_id AS gameId,amount AS price,status,created_at AS createdAt FROM steam_orders WHERE owner=? ORDER BY created_at DESC'
    ).bind(owner).all();
    return reply({ok: true, orders: results.map(publicSteamOrder)});
  }
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
      'SELECT id AS orderId,product_id AS gameId,amount AS price,status,created_at AS createdAt FROM steam_orders WHERE id=? AND owner=?'
    ).bind(String(body.orderId || ''), owner).first();
    if (!order) return reply({ok: false}, 404);
    if (order.status === 'PAID') {
      const stock = await env.STEAM_DB.prepare(
        'SELECT username AS account,password FROM steam_stock WHERE order_id=?'
      ).bind(order.orderId).first();
      if (stock) Object.assign(order, stock);
      else order.status = 'AWAITING_STOCK';
    }
    return reply({ok: true, order: publicSteamOrder(order)});
  }
  return reply({ok: false}, 404);
}
