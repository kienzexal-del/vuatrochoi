import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const gas=readFileSync(new URL('../GoogleAppsScript_Code.js',import.meta.url),'utf8');
const check=gas.slice(gas.indexOf('function handleCheckOrder('),gas.indexOf('function handleSepayWebhook('));
function lookup(token,stored='a'.repeat(32)) {
  const rows=[['headers'],['VTCH-ABC123',10000,'1 day','TEST-KEY','PAID','','','','',stored]];
  const context=vm.createContext({responseJson:x=>x,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>rows})})})}});
  vm.runInContext(check,context);return context.handleCheckOrder('VTCH-ABC123',token);
}
test('missing, wrong and legacy-empty token cannot retrieve keys',()=>{
  for(const [token,stored] of [[undefined,'a'.repeat(32)],['','a'.repeat(32)],['b'.repeat(32),'a'.repeat(32)],['','']]){
    const result=lookup(token,stored);assert.equal(result.status,'UNAUTHORIZED');assert.equal(result.key,undefined);
  }
});
test('correct bearer token retains existing guest recovery',()=>{assert.equal(lookup('a'.repeat(32)).key,'TEST-KEY');});
const html=readFileSync(new URL('../buy.html',import.meta.url),'utf8');
const script=html.slice(html.indexOf('    const API_URL ='),html.lastIndexOf('</script>'));
test('create-order failure cannot expose an invented QR payment',async()=>{
  const nodes={};const context=vm.createContext({document:{getElementById:id=>nodes[id]??=( {style:{},classList:{add(){},remove(){}},src:''})},fetch:async()=>{throw Error('offline');},setInterval:()=>0,clearInterval(){},setTimeout(){},console});
  vm.runInContext(script,context);await context.openPaymentModal('trial_1',10000,'1 ngày');
  assert.equal(nodes.qrImage.src,'');
});
