// Canonical bootstrap, safe reapplication and rollback-only atomic Intake contract.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [modulePath,extensionPath,schemaPath]=process.argv.slice(2);
const {PGlite}=await import(pathToFileURL(modulePath));
const {uuid_ossp}=await import(pathToFileURL(extensionPath));
const db=new PGlite({extensions:{uuid_ossp}});await db.waitReady;
const read=file=>fs.readFileSync(file,'utf8').replace(/^\\.*$/gm,'');
const dbRoot=path.dirname(schemaPath);
try {
 await db.exec(read(schemaPath));
 for(let pass=0;pass<2;pass++)await db.exec(read(path.join(dbRoot,'migrations/atomic_intake.sql')));
 await db.exec(read(path.join(dbRoot,'tests/verify_atomic_intake.sql')));
 console.log('PASS atomic Intake SQL: 24 enrollment/replay cases, 14 full rollback/retry boundaries, strict input/authority/owner/payload checks and migration reapplication');
} finally {await db.close();}
