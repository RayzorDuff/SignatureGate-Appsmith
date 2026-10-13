// Synthetic initialization fixtures; returned canonical authority is independent of cached query data.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Cash Deposits/jsobjects/cashDepositFlows/cashDepositFlows.js',import.meta.url),'utf8');
const email='synthetic-cash-access@example.invalid';
const actor={email,person_id:'synthetic-person',is_donations_reviewer:true,can_cash_deposits:true};
function fixture(result=[actor]) {
 const calls={financial:[],alerts:[]};
 const context={setTimeout:fn=>fn(),appsmith:{user:{email},store:{}},qPageAccess:{data:[],run:async()=>result},qCashDepositAccessDiagnostic:{run:async()=>[]},
  storeValue:async(k,v)=>{context.appsmith.store[k]=v;},showAlert:(message,level)=>calls.alerts.push({message,level}),
  qCashDepositCashOnHand:{run:async()=>calls.financial.push('cash')},qCashDepositBatches:{run:async()=>calls.financial.push('batch')},
  apiCashDepositBankAccounts:{run:async()=>calls.financial.push('bank')}};
 const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.cashDepositFlows ='),context);
 return {flows,context,calls};
}
{
 const f=fixture();assert.equal(f.flows.hasAccess(),false);assert.match(f.flows.accessMessage(),/Checking/);
 await f.flows.refresh();assert.equal(f.flows.hasAccess(),true,'canonical run result authorizes even while .data remains empty');
 assert.equal(f.flows.facilitatorId(),actor.person_id,'staff needs no legacy Participant');assert.equal(f.calls.financial.length,3);
 f.context.appsmith.user.email='synthetic-different@example.invalid';assert.equal(f.flows.hasAccess(),false,'prior account snapshot cannot authorize current account');
}
for (const [result,status] of [[[], 'unlinked'],[[{...actor,is_donations_reviewer:false,can_cash_deposits:false}],'denied'],[[{...actor,email:'synthetic-other@example.invalid'}],'unlinked']]) {
 const f=fixture(result);await f.flows.refresh();assert.equal(f.flows.accessState().status,status);assert.equal(f.flows.hasAccess(),false);assert.equal(f.calls.financial.length,0);
}
{
 const f=fixture();f.context.qPageAccess.run=async()=>{throw Error('Synthetic lookup failure');};
 await f.flows.refresh();assert.equal(f.flows.accessState().status,'error');assert.equal(f.calls.financial.length,0);assert.match(f.flows.accessMessage(),/could not verify/);
 f.context.qPageAccess.run=async()=>[actor];await f.flows.refresh();assert.equal(f.flows.hasAccess(),true,'retry recovers without granting permissions');
}
{
 const f=fixture();let finish,first=true;
 f.context.qPageAccess.run=async()=>{if(first){first=false;return new Promise(resolve=>finish=resolve);}return [actor];};
 const stale=f.flows.refresh();for(let i=0;i<8 && !finish;i++)await Promise.resolve();assert.ok(finish);
 await f.flows.refresh();finish([]);await stale;assert.equal(f.flows.hasAccess(),true,'late stale denial cannot replace newer ready result');assert.equal(f.calls.financial.length,3);
}
{
 const f=fixture();f.context.qPageAccess.run=async()=>{f.context.appsmith.user.email='synthetic-other@example.invalid';return [actor];};
 await f.flows.refresh();assert.equal(f.flows.hasAccess(),false);assert.equal(f.calls.financial.length,0);
}
{
 const f=fixture();f.context.apiCashDepositBankAccounts.run=async()=>{throw Error('Synthetic bank failure');};
 await f.flows.refresh();assert.equal(f.flows.hasAccess(),true,'bank lookup failure does not claim missing role');assert.deepEqual(f.calls.alerts.map(x=>x.level),['warning']);
}
{
 const f=fixture();let attempts=0;f.context.qPageAccess.run=async()=>{if(++attempts===1)throw Error('Synthetic transient');return [actor];};await f.flows.refresh();assert.equal(attempts,2);assert.equal(f.flows.hasAccess(),true);assert.equal(f.calls.financial.length,3);
}
const page=new URL('../pages/Cash Deposits/',import.meta.url);
const mode=JSON.parse(fs.readFileSync(new URL('queries/qPageAccess/metadata.json',page),'utf8')).unpublishedAction;
assert.equal(mode.runBehaviour,'MANUAL');assert.equal(mode.userSetOnLoad,true);
for(const file of fs.readdirSync(new URL('widgets/',page)).filter(x=>x.endsWith('.json'))){
 const text=fs.readFileSync(new URL('widgets/'+file,page),'utf8');assert.doesNotMatch(text,/qCashDepositCurrentFacilitator/,'display must use single canonical access authority: '+file);
}
for(const name of fs.readdirSync(new URL('queries/',page))){
 const m=JSON.parse(fs.readFileSync(new URL('queries/'+name+'/metadata.json',page),'utf8'));
 if(['DB','API'].includes(m.pluginType)){assert.equal(m.unpublishedAction.runBehaviour,'MANUAL',name);assert.equal(m.unpublishedAction.userSetOnLoad,true,name+' deliberate execution must persist');}
}
console.log('PASS Cash Deposits initialization: empty cache, unlinked/denied/error, retry, stale request/account, bank failure, canonical nonmember reviewer and single visibility authority');
