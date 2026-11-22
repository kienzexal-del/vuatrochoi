const encoder = new TextEncoder();
let jwks;
let keyExpiry = 0;

function decodeBase64Url(segment) {
  return Uint8Array.from(atob(segment.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

async function verifyGoogle(token, audience) {
  if (!audience || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || token.length > 8192) return null;
  const [headerPart, payloadPart, signature] = token.split('.');
  const decode = part => JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
  const header = decode(headerPart);
  const claims = decode(payloadPart);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
      claims.aud !== audience || !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000 || !/^\d{1,255}$/.test(claims.sub ?? '')) return null;

  if (!jwks || Date.now() >= keyExpiry) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('Google public keys unavailable');
    jwks = (await response.json()).keys;
    const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] ?? 60);
    keyExpiry = Date.now() + Math.min(maxAge, 3600) * 1000;
  }
  const jwk = jwks.find(candidate => candidate.kid === header.kid && candidate.kty === 'RSA' && candidate.alg === 'RS256');
  if (!jwk) return null;
  const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
  const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
  const valid = await crypto.subtle.verify(algorithm, key, decodeBase64Url(signature), encoder.encode(headerPart + '.' + payloadPart));
  return valid ? claims.sub : null;
}

const response = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

async function signedOrderCall(env, payload) {
  const endpoint = new URL(env.ORDER_API_URL);
  if (endpoint.origin !== 'https://script.google.com' || !env.SHOP_GATEWAY_SECRET) throw new Error('Shop gateway not configured');
  const message = JSON.stringify({...payload, at: Date.now()});
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SHOP_GATEWAY_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  const mac = Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
  const upstream = await fetch(endpoint, {method:'POST', body: JSON.stringify({shopGateway: true, message, mac})});
  if (!upstream.ok) throw new Error('Order backend unavailable');
  const result = await upstream.json();
  if (!result.ok) return response({}, result.status === 404 ? 404 : result.status === 409 ? 409 : 502);
  if (result.order?.status === 'PENDING') {
    result.order.payment = {bank: env.PAYMENT_BANK, account: env.PAYMENT_ACCOUNT, name: env.PAYMENT_NAME};
  }
  return response(result);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/shop-config') return response({googleClientId: env.GOOGLE_CLIENT_ID ?? ''});
    if (url.pathname !== '/api/shop-account') {
      if (url.pathname === '/buy') {
        url.pathname = '/shop/index.html';
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'POST' || request.headers.get('Origin') !== env.SHOP_ORIGIN) return response({}, 403);
    try {
      const body = await request.json();
      const subject = await verifyGoogle(typeof body.credential === 'string' ? body.credential : '', env.GOOGLE_CLIENT_ID);
      if (!subject) return response({}, 401);
      if (body.action === 'me') return response({user: {name: 'Tài khoản Google'}});
      if (!['create', 'list', 'detail'].includes(body.action)) return response({}, 400);
      return await signedOrderCall(env, {
        action: body.action, subject, plan: body.plan, orderId: body.orderId, requestId: body.requestId
      });
    } catch {
      return response({}, 503);
    }
  }
};
