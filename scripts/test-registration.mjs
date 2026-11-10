import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dataDir=await mkdtemp(join(tmpdir(),'summit-reg-'));
const port=18000+Math.floor(Math.random()*10000);
const env={...process.env,PORT:String(port),DATA_DIR:dataDir,ADMIN_USER:'ci-admin',ADMIN_PASSWORD:'ci-test-password-that-is-long-enough'};
const child=spawn(process.execPath,['app/server.mjs'],{env,stdio:['ignore','pipe','pipe']});
let logs='';
child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const base='http://127.0.0.1:'+port;
async function wait(){
 for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('Server exited: '+logs);try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,150));}
 throw Error('Server did not become ready: '+logs);
}
try{
 await wait();
 const health=await (await fetch(base+'/api/health')).json();assert.equal(health.ok,true);
 const payload={fullName:'CI Test Delegate',email:'ci@example.test',organisation:'Test Organisation',country:'Kenya',category:'Academic / researcher',attendance:'In person',consent:true,website:''};
 const submitted=await fetch(base+'/api/registrations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 assert.equal(submitted.status,201);const result=await submitted.json();assert.equal(result.status,'Pending review');
 const rejected=await fetch(base+'/admin/export.csv');assert.equal(rejected.status,401);
 const auth='Basic '+Buffer.from('ci-admin:ci-test-password-that-is-long-enough').toString('base64');
 const exported=await fetch(base+'/admin/export.csv',{headers:{authorization:auth}});assert.equal(exported.status,200);
 const csv=await exported.text();assert.match(csv,/CI Test Delegate/);assert.match(csv,/ci@example\.test/);
 const files=await readFile(join(dataDir,'registrations.jsonl'),'utf8');assert.equal(files.trim().split('\n').length,1);
 console.log('PASS: registration API validates, stores privately, and requires organiser authentication for CSV export.');
}finally{child.kill('SIGTERM');await rm(dataDir,{recursive:true,force:true});}
