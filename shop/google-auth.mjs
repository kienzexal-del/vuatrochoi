// Mount these routes ahead of static assets. SHOP_DB is a private D1 binding.
const sessionAge = 7 * 86400;
const stateAge = 600;
const secureCookie = 'Path=/; HttpOnly; Secure; SameSite=Lax';
const stateCookie = '__Host-vtch-oauth';
const sessionCookie = '__Host-vtch-session';
const tokenPattern = /^[a-f0-9]{64}$/;

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
function cookie(request, name) {
  const entry = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(name + '='));
  return entry?.slice(name.length + 1) ?? '';
}
function redirect(location, cookies = []) {
  const headers = new Headers({'Location': location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'});
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, {status: 303, headers});
}
function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
}
export async function shopAccount(request, env) {
  const session = cookie(request, sessionCookie);
  if (!tokenPattern.test(session)) return null;
  return env.SHOP_DB.prepare('SELECT google_sub FROM shop_sessions WHERE id_hash = ? AND expires_at > ?')
    .bind(hex(await digest(session)), Math.floor(Date.now() / 1000)).first();
}

export async function googleAuthRoute(request, env, fetchGoogle = fetch) {
  const url = new URL(request.url);
  const route = request.method + ' ' + url.pathname;
  if (route === 'GET /api/me') {
    const account = await shopAccount(request, env);
    return json({user: account ? {name: 'Tài khoản Google'} : null});
  }
  if (route === 'POST /api/logout') {
    if (request.headers.get('Origin') !== env.SHOP_ORIGIN) return json({ok: false}, 403);
    const session = cookie(request, sessionCookie);
    if (tokenPattern.test(session)) {
      await env.SHOP_DB.prepare('DELETE FROM shop_sessions WHERE id_hash = ?').bind(hex(await digest(session))).run();
    }
    return new Response(JSON.stringify({ok: true}), {status: 200, headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie + '=; Max-Age=0; ' + secureCookie
    }});
  }
  if (route !== 'GET /auth/login' && route !== 'GET /auth/google/callback') return null;
  if (url.origin !== env.SHOP_ORIGIN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SHOP_DB) {
    return json({error: 'Đăng nhập Google chưa được cấu hình.'}, 503);
  }
  const callback = env.SHOP_ORIGIN + '/auth/google/callback';
  if (route === 'GET /auth/login') {
    const state = randomToken();
    const verifier = randomToken();
    const challenge = btoa(String.fromCharCode(...await digest(verifier))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: 'code',
      scope: 'openid', state, code_challenge: challenge, code_challenge_method: 'S256'
    });
    return redirect(authorize.href, [stateCookie + '=' + state + '.' + verifier + '; Max-Age=' + stateAge + '; ' + secureCookie]);
  }

  const clearState = stateCookie + '=; Max-Age=0; ' + secureCookie;
  const failed = () => redirect('/buy?login=failed#orders', [clearState]);
  const [state, verifier] = cookie(request, stateCookie).split('.');
  const code = url.searchParams.get('code');
  if (!code || !tokenPattern.test(state ?? '') || !tokenPattern.test(verifier ?? '') ||
      state !== url.searchParams.get('state')) return failed();

  try {
    const exchange = await fetchGoogle('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code, code_verifier: verifier, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callback, grant_type: 'authorization_code'
      }),
      redirect: 'error'
    });
    if (!exchange.ok) return failed();
    const {access_token: accessToken} = await exchange.json();
    if (typeof accessToken !== 'string' || !accessToken) return failed();
    const profile = await fetchGoogle('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {Authorization: 'Bearer ' + accessToken}, redirect: 'error'
    });
    if (!profile.ok) return failed();
    const {sub} = await profile.json();
    if (typeof sub !== 'string' || !sub || sub.length > 255) return failed();
    const session = randomToken();
    await env.SHOP_DB.prepare('INSERT INTO shop_sessions (id_hash, google_sub, expires_at) VALUES (?, ?, ?)')
      .bind(hex(await digest(session)), sub, Math.floor(Date.now() / 1000) + sessionAge).run();
    return redirect('/buy#orders', [clearState, sessionCookie + '=' + session + '; Max-Age=' + sessionAge + '; ' + secureCookie]);
  } catch {
    return failed();
  }
}
