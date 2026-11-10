// Artificial fixtures only; this test never reads an operational database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../pages/Reports/jsobjects/reports/reports.js',import.meta.url),'utf8');
function fixture(actor, options={}) {
 const calls={queries:0,redirects:0};
 const context={navigationLabels:{text:copy=>copy},
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
 assert.equal(reports.metricOptions().length,role==='is_donations_reviewer'?18:3);
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
{
 const {reports,context}=fixture({person_id:'synthetic-person',is_donations_reviewer:true},{selected:['members_created','member_donations_count','participant_donations_count']});
 await reports.verifyaccess();
 assert.deepEqual(Array.from(reports.selectedMetricKeys()),['participants_created','participant_donations_count'],'normalize retained selections and deduplicate');
 context.navigationLabels.text=copy=>copy.replace(/Participants/g,'Attendees').replace(/Participant/g,'Attendee').replace(/Contributors/g,'Supporters').replace(/Contributor/g,'Supporter').replace(/contributor/g,'supporter');
 const options=reports.metricOptions();
 assert.ok(options.some(o=>o.label==='Supporters created'));
 assert.ok(options.some(o=>o.label==='Attendees created'));
 assert.ok(reports.scopeLabel().includes('Supporters and donations'));
 const defaults=JSON.parse(JSON.parse(fs.readFileSync(new URL('../pages/Reports/widgets/cntReports/msReportMetrics.json',import.meta.url),'utf8')).defaultOptionValue);
 assert.ok(defaults.includes('contributors_created')&&defaults.includes('participants_created')&&defaults.includes('contributor_donations_count'));
 assert.ok(!defaults.includes('participant_donations_count'),'overlapping subset is opt-in');
 const table=JSON.parse(fs.readFileSync(new URL('../pages/Reports/widgets/cntReports/tblReportRows.json',import.meta.url),'utf8'));
 context.reports=reports;
 context.qReportTimeSeries.data=[{metric_key:'participants_created',metric_label:'Participants created',value:2},{metric_key:'participant_donations_count',metric_label:'Participant-linked donations (subset)',value:1}];
 const projected=vm.runInNewContext(table.tableData.slice(2,-2),context);
 assert.equal(projected[0].metric_label,'Attendees created');assert.equal(projected[1].metric_label,'Attendee-linked donations (subset)');
 assert.equal(table.primaryColumns.metric_key.isVisible,false,'do not display internal compatibility identifiers');
 context.appsmith.user.email='another@example.invalid';
 assert.equal(vm.runInNewContext(table.tableData.slice(2,-2),context).length,0);
 assert.equal(reports.scopeLabel().includes('all Supporters'),false,'old account scope not displayed');
}
console.log('PASS Reports nonmember role access, denial, stale-state clearing and financial selection/result isolation');
