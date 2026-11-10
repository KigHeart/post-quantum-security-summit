import http from 'node:http';
import { readFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const ROOT=resolve(process.env.SITE_DIR||process.cwd());
const DATA_DIR=resolve(process.env.DATA_DIR||'./data');
const DATA_FILE=resolve(DATA_DIR,'registrations.jsonl');
const PORT=Number(process.env.PORT||8080);
const ADMIN_USER=process.env.ADMIN_USER||'';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const MAX_BODY=16*1024, rate=new Map();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"});res.end(body);}
function json(res,status,obj){send(res,status,JSON.stringify(obj));}
function clean(v,max){return typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';}
function csv(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
function authorized(req){if(!ADMIN_USER||!ADMIN_PASSWORD)return false;const h=req.headers.authorization||'';if(!h.startsWith('Basic '))return false;let d;try{d=Buffer.from(h.slice(6),'base64').toString();}catch{return false;}const i=d.indexOf(':');if(i<0)return false;const u=Buffer.from(d.slice(0,i)),p=Buffer.from(d.slice(i+1)),eu=Buffer.from(ADMIN_USER),ep=Buffer.from(ADMIN_PASSWORD);return u.length===eu.length&&p.length===ep.length&&timingSafeEqual(u,eu)&&timingSafeEqual(p,ep);}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>MAX_BODY)throw Error('Request too large');}return JSON.parse(raw);}
function limited(req){const ip=req.socket.remoteAddress||'unknown',now=Date.now(),old=rate.get(ip)||[],recent=old.filter(t=>now-t<3600000);if(recent.length>=8){rate.set(ip,recent);return true;}recent.push(now);rate.set(ip,recent);return false;}
http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,service:'summit-registration',storage:'local'});
 if(req.method==='POST'&&url.pathname==='/api/registrations'){
  if(limited(req))return json(res,429,{error:'Too many attempts. Please try again later.'});
  if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'Expected JSON submission.'});
  let d;try{d=await body(req);}catch(e){return json(res,400,{error:e.message==='Request too large'?'Request too large.':'Invalid submission.'});}
  if(clean(d.website,200))return json(res,200,{ok:true});
  const r={id:randomUUID(),receivedAt:new Date().toISOString(),status:'Pending review',fullName:clean(d.fullName,120),email:clean(d.email,254),phone:clean(d.phone,40),organisation:clean(d.organisation,160),jobTitle:clean(d.jobTitle,120),country:clean(d.country,100),category:clean(d.category,80),attendance:clean(d.attendance,60),interests:clean(d.interests,2000),accessibility:clean(d.accessibility,1000),consent:d.consent===true};
  if(!r.fullName||!/^\S+@\S+\.\S+$/.test(r.email)||!r.organisation||!r.country||!r.category||!r.attendance||!r.consent)return json(res,422,{error:'Please complete all required fields and consent.'});
  try{await mkdir(DATA_DIR,{recursive:true,mode:0o700});await appendFile(DATA_FILE,JSON.stringify(r)+'\n',{encoding:'utf8',mode:0o600});}catch(e){console.error('Storage error:',e.message);return json(res,503,{error:'Registration storage is temporarily unavailable. Please contact the organiser.'});}
  console.log('Registration received:',r.id);return json(res,201,{ok:true,id:r.id,status:r.status});
 }
 if(req.method==='GET'&&url.pathname==='/admin/export.csv'){
  if(!authorized(req)){res.setHeader('WWW-Authenticate','Basic realm="Summit organiser", charset="UTF-8"');return json(res,401,{error:'Organiser authentication required.'});}
  try{const raw=await readFile(DATA_FILE,'utf8'),rows=raw.split('\n').filter(Boolean).map(x=>JSON.parse(x)),keys=['id','receivedAt','status','fullName','email','phone','organisation','jobTitle','country','category','attendance','interests','accessibility','consent'];const out=[keys.join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\r\n');res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="summit-delegate-registrations.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(out);}catch(e){if(e.code==='ENOENT')return send(res,200,'id,receivedAt,status,fullName,email,phone,organisation,jobTitle,country,category,attendance,interests,accessibility,consent\r\n','text/csv; charset=utf-8');return json(res,500,{error:'Could not export registrations.'});}
 }
 if(req.method==='GET'){const p=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname),file=resolve(ROOT,'.'+p);if(file!==ROOT&&!file.startsWith(ROOT+sep))return json(res,403,{error:'Forbidden.'});try{const s=await stat(file);if(!s.isFile())return json(res,404,{error:'Not found.'});return send(res,200,await readFile(file),mime[extname(file)]||'application/octet-stream');}catch{return json(res,404,{error:'Not found.'});}}
 return json(res,405,{error:'Method not allowed.'});
}).listen(PORT,'0.0.0.0',()=>console.log('Summit registration server listening on '+PORT));
