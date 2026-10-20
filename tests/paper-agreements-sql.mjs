// Canonical schema and rollback-only backend paper fixtures, synthetic documents only.
import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const [modulePath,extensionPath,schemaPath]=process.argv.slice(2);const {PGlite}=await import(pathToFileURL(modulePath));const {uuid_ossp}=await import(pathToFileURL(extensionPath));
const db=new PGlite({extensions:{uuid_ossp}});await db.waitReady;
const sql=file=>fs.readFileSync(file,'utf8').replace(/^\\.*$/gm,'');
try{
 await db.exec(sql(schemaPath));
 const backend=new URL('../../SignatureGate/',import.meta.url);
 const migration=sql(new URL('db/migrations/paper_agreement_upload.sql',backend));
 await db.exec(migration);await db.exec(migration);
 // Preserve a real legacy reservation across the new migration, including its original hash.
 const actor=(await db.query("INSERT INTO public.people(display_name) VALUES('Synthetic Legacy Storage Staff') RETURNING person_id")).rows[0].person_id;
 const person=(await db.query("INSERT INTO public.people(display_name) VALUES('Synthetic Legacy Storage Participant') RETURNING person_id")).rows[0].person_id;
 const member=(await db.query('INSERT INTO public.members(person_id) VALUES($1) RETURNING member_id',[person])).rows[0].member_id;
 await db.query("INSERT INTO public.person_app_accounts(person_id,email) VALUES($1,'legacy-storage-staff@example.invalid')",[actor]);
 await db.query("INSERT INTO public.person_roles(person_id,role_key,assigned_by) VALUES($1,'practitioner','synthetic'),($1,'document_reviewer','synthetic')",[actor]);
 await db.query('INSERT INTO public.member_practitioner_assignments(member_id,practitioner_person_id) VALUES($1,$2)',[member,actor]);
 const request=(await db.query('SELECT public.uuid_generate_v4() AS id')).rows[0].id;
 const payload=JSON.stringify({member_id:member,practitioner_person_id:actor,files:[{name:'synthetic.pdf',mimeType:'application/pdf',data:'JVBERi0xLjQgc3ludGhldGlj'}]});
 await db.query("SELECT public.application_begin_paper_upload('legacy-storage-staff@example.invalid',$1,$2::jsonb)",[request,payload]);
 const prior=(await db.query('SELECT payload_sha256,status,member_agreement_id FROM public.paper_agreement_upload_requests WHERE request_id=$1',[request])).rows[0];
 const storage=sql(new URL('db/migrations/paper_evidence_storage.sql',backend));await db.exec(storage);await db.exec(storage);
 assert.deepEqual((await db.query('SELECT payload_sha256,status,member_agreement_id FROM public.paper_agreement_upload_requests WHERE request_id=$1',[request])).rows[0],prior);
 assert.equal((await db.query("SELECT public.application_begin_paper_upload('legacy-storage-staff@example.invalid',$1,$2::jsonb) AS receipt",[request,payload])).rows[0].receipt.proceed,false);

 await db.exec(sql(new URL('db/tests/verify_paper_agreement_upload.sql',backend)));
 await db.exec(sql(new URL('db/tests/verify_paper_evidence_storage.sql',backend)));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.paper_agreement_upload_requests')).rows[0].n,1);
 console.log('PASS paper upload SQL: legacy pending receipt/hash preserved across provider migration/reapplication; private Drive and legacy NocoDB reference guards; migration reapplication, no-email assigned practitioner, reviewer, self/unassigned/owner/payload denial, content/path limits, pending no-repeat claims, exact completion replay, independent reasoned reviewer approval and atomic audit rollback');
}finally{await db.close();}
