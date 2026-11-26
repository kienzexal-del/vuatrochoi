import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./GoogleAppsScript_Code.js',import.meta.url),'utf8');
function verify({trial=false,status='Available',registered='',expires='',oldTrial=true}={}) {
  const row=['TEST-LICENSE',status,registered,'','Test customer',1,expires,''];
  const sheet={getDataRange:()=>({getValues:()=>[['Key','Status','HWID'],row]}),getRange:(r,c)=>({setValue:v=>{row[c-1]=v;}})};
  const removed=[];
  const old={getDataRange:()=>({getValues:()=>[['Key','Status','HWID'],['OLD','Trial','test-device']]}),deleteRow:r=>removed.push(r)};
  const sheets={[trial?'Keys_1Ngay':'Keys_VinhVien']:sheet,...(oldTrial?{Keys_Trial:old}:{})};
  const context=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},Utilities:{formatDate:d=>d.toISOString()},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}});
  vm.runInContext(source,context);
  return {result:context.doGet({parameter:{key:'TEST-LICENSE',hwid:'test-device'}}),row,removed};
}
test('new lifetime activation binds device and clears previous trial',()=>{const {result,row,removed}=verify();assert.equal(result.success,true,result.message);assert.equal(row[2],'test-device');assert.deepEqual(removed,[2]);});
test('lifetime activation succeeds without legacy trial sheet',()=>{const {result}=verify({oldTrial:false});assert.equal(result.success,true,result.message);});
test('daily activation keeps its expiry and binds device',()=>{const {result,row,removed}=verify({trial:true});assert.equal(result.success,true,result.message);assert.equal(result.isTrial,true);assert.ok(result.expiresTimestamp>Date.now()/1000);assert.equal(row[2],'test-device');assert.deepEqual(removed,[]);});
test('locked license is rejected without device binding',()=>{const {result,row}=verify({status:'Locked'});assert.equal(result.success,false);assert.equal(result.isLocked,true);assert.equal(row[2],'');});
test('another device is rejected',()=>{const {result}=verify({registered:'another-device'});assert.equal(result.success,false);});
test('expired daily license is rejected',()=>{const {result}=verify({trial:true,registered:'test-device',expires:'2020-01-01'});assert.equal(result.success,false);assert.equal(result.isExpired,true);});
