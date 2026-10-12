// Artificial browser fixtures; no operational identities or financial values.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Cash Deposits/jsobjects/cashDepositFlows/cashDepositFlows.js',import.meta.url),'utf8');
const actor='synthetic-reviewer@example.invalid';
function fixture({allowed=true,reason='Synthetic recovered cash',notes='',writeFail=false,refreshFail=false,delayWrite=false}={}) {
 const calls={writes:[],alerts:[],modals:[],resets:[],access:0};
 let release;
 const hold=delayWrite?new Promise(resolve=>{release=resolve;}):Promise.resolve();
 const context={appsmith:{user:{email:actor},store:{}},
  qPageAccess:{data:[{email:actor,is_donations_reviewer:allowed,can_cash_deposits:allowed,person_id:'synthetic-actor'}],run:async()=>{calls.access++;return context.qPageAccess.data;}},
  tblCashDeposits:{processedTableData:[{donation_id:'synthetic-excluded',operational_status:'deposit_reconciliation_excluded'},{donation_id:'synthetic-cash',operational_status:'cash_on_hand'}],selectedRow:{}},
  inpCashDispositionReason:{text:reason},inpCashDispositionNotes:{text:notes},
  storeValue:async(k,v)=>{context.appsmith.store[k]=v;},resetWidget:name=>{calls.resets.push(name);},
  showModal:async name=>{calls.modals.push(['open',name]);},closeModal:async name=>{calls.modals.push(['close',name]);},
  showAlert:(message,level)=>calls.alerts.push({message,level}),
  qCashDepositCashOnHand:{run:async()=>{if(refreshFail)throw Error('Synthetic refresh failure');return [];}},
  qReviveCashDonation:{run:async params=>{calls.writes.push({kind:'revive',...params});await hold;if(writeFail)throw Error('Synthetic write failure');return [];}},
  qExcludeCashDonation:{run:async params=>{calls.writes.push({kind:'exclude',...params});await hold;if(writeFail)throw Error('Synthetic write failure');return [];}}
 };
 const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.cashDepositFlows ='),context);
 return {flows,context,calls,release};
}
for(const [mode,id] of [['revive','synthetic-excluded'],['exclude','synthetic-cash']]) {
 const f=fixture({notes:' Synthetic note '});
 assert.equal(await f.flows.openDisposition(id,mode),true);
 assert.equal(f.calls.writes.length,0,'opening does not mutate');
 assert.equal(f.context.appsmith.store.cash_reconciliation_intent.donation_id,id);
 assert.equal(f.calls.resets.length,2);
 assert.equal(await f.flows.submitDisposition(),id);
 assert.equal(f.calls.writes.length,1);assert.equal(f.calls.writes[0].kind,mode);
 assert.equal(f.calls.writes[0].reason,'Synthetic recovered cash');assert.equal(f.calls.writes[0].notes,'Synthetic note');
 assert.deepEqual(f.calls.alerts.map(x=>x.level),['success']);assert.equal(f.context.appsmith.store.cash_reconciliation_intent,null);
}
{
 const f=fixture({reason:'   '});await f.flows.openDisposition('synthetic-excluded','revive');
 assert.equal(await f.flows.submitDisposition(),false);assert.equal(f.calls.writes.length,0);
 assert.deepEqual(f.calls.alerts.map(x=>x.level),['warning']);
}
{
 const f=fixture({allowed:false});assert.equal(await f.flows.openDisposition('synthetic-excluded','revive'),false);
 assert.equal(f.calls.writes.length,0);assert.equal(f.calls.modals.length,0);
}
for(const changed of ['role','account','response']) {
 const f=fixture();await f.flows.openDisposition('synthetic-excluded','revive');
 if(changed==='role')f.context.qPageAccess.data[0].can_cash_deposits=false;
 if(changed==='account')f.context.appsmith.user.email='synthetic-other@example.invalid';
 if(changed==='response')f.context.qPageAccess.data[0].email='synthetic-other@example.invalid';
 assert.equal(await f.flows.submitDisposition(),false);assert.equal(f.calls.writes.length,0);
 assert.deepEqual(f.calls.alerts.map(x=>x.level),['error']);
}
{
 const f=fixture();assert.equal(await f.flows.openDisposition('synthetic-cash','revive'),false);
 assert.equal(f.calls.writes.length,0);assert.equal(f.calls.modals.length,0);
}
{
 const f=fixture();await f.flows.openDisposition('synthetic-excluded','revive');await f.flows.clearDisposition();
 assert.equal(await f.flows.submitDisposition(),false);assert.equal(f.calls.writes.length,0,'cancelled intent cannot write');
}
{
 const f=fixture({writeFail:true});await f.flows.openDisposition('synthetic-excluded','revive');
 assert.equal(await f.flows.submitDisposition(),false);assert.equal(f.calls.writes.length,1);
 assert.deepEqual(f.calls.alerts.map(x=>x.level),['error']);assert.equal(f.context.appsmith.store.cash_reconciliation_busy,false);
 assert.ok(f.context.appsmith.store.cash_reconciliation_intent,'failed mutation retains intent for correction');
}
{
 const f=fixture({refreshFail:true});await f.flows.openDisposition('synthetic-excluded','revive');
 assert.equal(await f.flows.submitDisposition(),'synthetic-excluded');assert.equal(f.calls.writes.length,1);
 assert.deepEqual(f.calls.alerts.map(x=>x.level),['warning']);assert.match(f.calls.alerts[0].message,/do not repeat/i);
 assert.equal(await f.flows.submitDisposition(),false);assert.equal(f.calls.writes.length,1);
}
{
 const f=fixture({delayWrite:true});await f.flows.openDisposition('synthetic-excluded','revive');
 const first=f.flows.submitDisposition();assert.equal(await f.flows.submitDisposition(),false);
 f.release();await first;assert.equal(f.calls.writes.length,1,'double click cannot repeat in-flight mutation');
}
console.log('PASS reason, exact row/mode, authorization/account changes, cancel, double click, write/refresh failure and singular alerts');
