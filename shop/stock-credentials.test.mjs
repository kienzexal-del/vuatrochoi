import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {INITIAL_SLOTS} from './steam-guard-proxy.mjs';
test('combo and Hitman alternate slots retain actual credentials rather than invented suffixes',()=>{
  for(const gameId of ['combo_31','hitman_woa']){
    const slots=INITIAL_SLOTS.filter(s=>s.gameId===gameId);
    assert.equal(slots.length,2);
    assert.equal(slots[1].account,slots[0].account);
    assert.ok(slots[1].password===slots[0].password,"password must match the verified shared account");
    assert.notEqual(slots[1].id,slots[0].id);
    assert.notEqual(slots[1].yzid,slots[0].yzid);
  }
});
test('Onimusha alternate slots do not append rotation identifiers to login credentials',()=>{
  const verifiedPasswordHashes={"slot-onimusha-2":"b02d12dbaba541317010bfc0ce85383e61e0eab2f36b2ec79c5f3846aaabf8c9","slot-onimusha-3":"d129e9397c3f1457e5953e8741cdf152e6b95260a58328d7c6358bc2f799a7aa"};
  const verifiedAccountHashes={"slot-onimusha-2":"451ef1eb9754082d52b77b4577ada369059743e78b463436600cd97fa74bd1d1","slot-onimusha-3":"71e61639048402aaff7d7fc1537a7c1e0f2c67713c42f335c2ed9ad6d4818025"};
  const slots=INITIAL_SLOTS.filter(s=>s.gameId==='onimusha');
  for(const slot of slots.slice(1)){
    assert.ok(createHash("sha256").update(slot.account).digest("hex")===verifiedAccountHashes[slot.id],"account must match verified upstream record");
    assert.ok(createHash("sha256").update(slot.password).digest("hex")===verifiedPasswordHashes[slot.id],"password must match verified upstream record");
  }
});
