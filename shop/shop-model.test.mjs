import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrders, request, validOrder} from './shop-model.mjs';
const order = {id:'VTCH-ABC123', plan:'trial_1', amount:10000, status:'PENDING', createdAt:'2026-11-22T10:00:00Z'};
test('history survives arbitrary server ordering and does not mutate source', () => {
  const old = {...order,id:'VTCH-OLD123',createdAt:'2026-11-20T10:00:00Z'};
  const source = [old,order];
  assert.deepEqual(normalizeOrders(source),[order,old]); assert.equal(source[0],old);
});
test('reject malformed orders rather than rendering a payment', () => {
  for (const bad of [{...order,amount:-1},{...order,id:'<script>'},{...order,status:'SUCCESS'},{...order,createdAt:'bad'}]) {
    assert.equal(validOrder(bad),false); assert.throws(()=>normalizeOrders([bad]));
  }
});
test('failed creation never becomes a fabricated payable order', async () => {
  await assert.rejects(request('/api/orders',{},async()=>new Response('{}',{status:503})));
  await assert.rejects(request('/api/orders',{},async()=>new Response('<html>')));
});
test('expired session is distinguishable from network failure', async () => {
  await assert.rejects(request('/api/me',{},async()=>new Response('{}',{status:401})),{status:401});
});
