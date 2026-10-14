// Artificial fixtures only; this test never reads an operational database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../pages/Reports/jsobjects/reports/reports.js',import.meta.url),'utf8');
function fixture(actor, options={}) {
 const calls={queries:0,redirects:0};
 const context={navigationLabels:{text:copy=>copy},navigationLabels:{text:copy=>copy},
  appsmith:{user:{email:'report-actor@example.invalid'},store:{facilitator_id:'stale-member',facilitator_is_donations_reviewer:true,reports_actor_email:'prior@example.invalid'},mode:'PUBLISHED'},
  qCurrentFacilitator:{run:async()=>{if(options.error)throw Error('Synthetic lookup failure');return actor?[actor]:[];}},
  qPageAccess:{run:async()=>actor?[actor]:[]},
  qReportTimeSeries:{data:[{metric_key:'donations_dollars',value:999}],run:async()=>{calls.queries++;return [];}},
  msReportMetrics:{selectedOptionValues:options.selected||[]},selReportBucket:{selectedOptionValue:'month'},inpReportPeriods:{text:'12'},
  dpReportStart:{selectedDate:null},dpReportEnd:{selectedDate:null},
  storeValue:async(key,value)=>{context.appsmith.store[key]=value;},showAlert:()=>{},navigateTo:()=>{calls.redirects++;},console,setTimeout
 };
 const reports=vm.runInNewContext(source.replace(/^export default/,'globalThis.reports ='),context);
 return {reports,context,calls};
}
for(const role of ['is_document_reviewer','is_donations_reviewer','is_practitioner']) {
 const {reports,context}=fixture({person_id:'synthetic-person',member_id:null,email:'report-actor@example.invalid',[role]:true});
 assert.equal(await reports.verifyaccess(),true,'role requires no Participant capacity');
 assert.equal(context.appsmith.store.facilitator_id,'','clear stale legacy ID');
 assert.equal(reports.metricOptions().length,role==='is_donations_reviewer'?15:3);
}
for(const options of [{},{error:true}]) {
 const {reports,context,calls}=fixture(null,options);
 assert.equal(await reports.verifyaccess(),false);
 assert.equal(context.appsmith.store.facilitator_is_donations_reviewer,false);
 assert.equal(context.appsmith.store.reports_actor_email,'');
 assert.equal(reports.totalFor('donations_dollars'),0);
 assert.equal(calls.redirects,0,'permission denial preserves page navigation');
}
{
 const {reports}=fixture({person_id:'synthetic-person',is_directory_manager:true});
 assert.equal(await reports.verifyaccess(),false,'directory access alone grants no Reports role');
}
{
 const {reports,calls}=fixture({person_id:'synthetic-person',is_document_reviewer:true},{selected:['donations_dollars']});
 assert.equal(await reports.run().then(rows=>rows.length),0);
 assert.equal(calls.queries,0,'retained financial selection cannot run for a document reviewer');
}
{
 const {reports,context}=fixture({person_id:'synthetic-person',is_donations_reviewer:true});
 await reports.verifyaccess();
 assert.equal(reports.totalFor('donations_dollars'),999);
 context.appsmith.user.email='another@example.invalid';
 assert.equal(reports.metricOptions().length,3);
 assert.equal(reports.totalFor('donations_dollars'),0,'cached financial results hidden after account switch');
 assert.equal(reports.chartOptions().xAxis.data.length,0);
}
console.log('PASS Reports nonmember role access, denial, stale-state clearing and financial selection/result isolation');
