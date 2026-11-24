import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync, sign} from 'node:crypto';

test('history and credentials belong to the verified Google account across clients', async () => {
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  const jwk = {...publicKey.export({format: 'jwk'}), kid: 'test', alg: 'RS256'};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({keys: [jwk]});
  try {
    const source = readFileSync(new URL('./steam-payments.mjs', import.meta.url), 'utf8')
      .replace("'./gis-sheets-worker.mjs'", JSON.stringify(new URL('./gis-sheets-worker.mjs', import.meta.url).href))
      .replace("import games from '../games/games.json';", 'const games = [{id: 1817190, name: "Miles Morales"}];');
    const {steamPaymentRoute} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('./steam-payments.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO steam_orders(id,owner,product_id,amount,status,request_id) VALUES(?,?,?,?,?,?)')
      .run('SG111111111111111111111111', '111', '1817190', 50000, 'PAID', 'test-one');
    db.prepare('INSERT INTO steam_orders(id,owner,product_id,amount,status,request_id) VALUES(?,?,?,?,?,?)')
      .run('SG222222222222222222222222', '222', '1817190', 50000, 'PENDING', 'test-two');
    db.prepare('INSERT INTO steam_stock(id,product_id,username,password,order_id) VALUES(?,?,?,?,?)')
      .run('stock-test', '1817190', 'test-account', 'test-password', 'SG111111111111111111111111');
    const env = {GOOGLE_CLIENT_ID: 'test-client', PAYMENT_ACCOUNT: 'test-bank', SEPAY_WEBHOOK_SECRET: 'test-secret',
      STEAM_DB: {prepare(sql) {return {bind(...args) {const stmt = db.prepare(sql); return {
        first: async () => stmt.get(...args), all: async () => ({results: stmt.all(...args)}), run: async () => stmt.run(...args)
      };}};}}};
    const token = sub => {
      const h = Buffer.from(JSON.stringify({alg: 'RS256', kid: 'test'})).toString('base64url');
      const p = Buffer.from(JSON.stringify({sub, aud: 'test-client', iss: 'accounts.google.com', exp: Math.floor(Date.now()/1000)+300})).toString('base64url');
      return h+'.'+p+'.'+sign('RSA-SHA256', Buffer.from(h+'.'+p), privateKey).toString('base64url');
    };
    const call = (sub, path, body = {}) => steamPaymentRoute(new Request('https://gamegiare.com/api/steam/'+path, {
      method: 'POST', headers: {Origin: 'https://gamegiare.com', Authorization: 'Bearer '+token(sub)}, body: JSON.stringify(body)
    }), env);
    await call('111','license-platforms',{orderId:'VTCH-TEST123',platform:'macos'});
    const platformList=await (await call('111','license-platforms')).json();
    assert.deepEqual(platformList.platforms,[{orderId:'VTCH-TEST123',platform:'macos'}]);
    assert.deepEqual((await (await call('222','license-platforms')).json()).platforms,[]);
    assert.equal((await call('111','license-platforms',{orderId:'VTCH-TEST123',platform:'invalid'})).status,400);
    await call('111','license-platforms',{orderId:'VTCH-TEST123',platform:'windows'});
    assert.equal((await (await call('111','license-platforms')).json()).platforms[0].platform,'macos');
    const first = await (await call('111', 'orders')).json();
    const secondClient = await (await call('111', 'orders')).json();
    assert.deepEqual(first, secondClient);
    assert.equal(first.orders.length, 1);
    assert.equal(first.orders[0].title, 'Miles Morales');
    assert.equal(first.orders[0].password, undefined);
    assert.equal((await (await call('222', 'orders')).json()).orders[0].id, 'SG222222222222222222222222');
    assert.equal((await call('222', 'order', {orderId: first.orders[0].id})).status, 404);
    assert.equal((await (await call('111', 'order', {orderId: first.orders[0].id})).json()).order.account, 'test-account');
    const pending = await (await call('222', 'order', {orderId: 'SG222222222222222222222222'})).json();
    assert.equal(pending.order.password, undefined);
  } finally { globalThis.fetch = originalFetch; }
});
