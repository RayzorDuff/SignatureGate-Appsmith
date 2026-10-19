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
 await db.exec(sql(new URL('db/tests/verify_paper_agreement_upload.sql',backend)));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.paper_agreement_upload_requests')).rows[0].n,0);
 console.log('PASS paper upload SQL: migration reapplication, no-email assigned practitioner, reviewer, self/unassigned/owner/payload denial, content/path limits, pending no-repeat claims, exact completion replay, independent reasoned reviewer approval and atomic audit rollback');
}finally{await db.close();}
