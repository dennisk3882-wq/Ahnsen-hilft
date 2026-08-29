import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ORIGIN='https://finanzplan-pwa.onrender.com';
// Public key only. VAPID private key and banking-state HMAC secret are server-side.
const VAPID_PUBLIC='BLzgC1_mThT-PDptuY-42_gajqos7Xezgd0CkdF77eRA4gEu5Xhn7WVw1EqQHMho-s-OxzY3EXQiAYOb5AU4h-k';
const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false}});
let cachedVapidPrivate='',cachedStateSecret='',pushConfigured=false;

const cors=(origin:string|null)=>({
  'Access-Control-Allow-Origin':origin===APP_ORIGIN||origin?.startsWith('http://127.0.0.1')||origin?.startsWith('http://localhost')?origin:APP_ORIGIN,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json;charset=utf-8'}});
function b64urlBytes(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function b64urlText(s:string){return b64urlBytes(new TextEncoder().encode(s))}
function pemBytes(pem:string){const clean=pem.replaceAll('\\n','\n').replace(/-----[^-]+-----/g,'').replace(/\s+/g,'');const bin=atob(clean);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function runtimeSecret(name:string){const {data,error}=await admin.rpc('get_runtime_secret',{p_name:name});if(error||!data)throw new Error(`Server-Secret ${name} fehlt`);return String(data)}
async function ensurePush(){if(pushConfigured)return;if(!cachedVapidPrivate)cachedVapidPrivate=await runtimeSecret('vapid_private');webpush.setVapidDetails('mailto:finanzplan@localhost',VAPID_PUBLIC,cachedVapidPrivate);pushConfigured=true}
async function rsaKey(){const pem=Deno.env.get('ENABLE_BANKING_PRIVATE_KEY')||'';if(!pem)throw new Error('ENABLE_BANKING_PRIVATE_KEY fehlt');return crypto.subtle.importKey('pkcs8',pemBytes(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])}
async function ebJwt(){const kid=Deno.env.get('ENABLE_BANKING_APP_ID')||'';if(!kid)throw new Error('ENABLE_BANKING_APP_ID fehlt');const now=Math.floor(Date.now()/1000),h=b64urlText(JSON.stringify({alg:'RS256',typ:'JWT',kid})),p=b64urlText(JSON.stringify({iss:'enablebanking.com',aud:'api.enablebanking.com',iat:now,exp:now+3600})),input=`${h}.${p}`,sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',await rsaKey(),new TextEncoder().encode(input)));return `${input}.${b64urlBytes(sig)}`}
function providerError(j:any,status:number){const d=j?.detail??j?.message??j?.error;if(typeof d==='string'&&d.trim())return d.trim();if(d&&typeof d==='object'){const code=String(d.code||d.type||'').trim(),msg=String(d.message||d.detail||d.description||'').trim();if(code&&msg)return `${code}: ${msg}`;if(msg)return msg;if(code)return code;try{return JSON.stringify(d)}catch{}}if(j?.raw)return String(j.raw);return `Enable Banking ${status}`}
async function eb(path:string,init:RequestInit={}){const token=await ebJwt(),r=await fetch(`https://api.enablebanking.com${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers||{})}}),text=await r.text();let j:any={};try{j=text?JSON.parse(text):{}}catch{j={raw:text}}if(!r.ok)throw new Error(providerError(j,r.status));return j}
async function hmac(text:string){if(!cachedStateSecret)cachedStateSecret=await runtimeSecret('bank_state_hmac');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(cachedStateSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64urlBytes(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(text))))}
async function stateMake(o:any){const payload=b64urlText(JSON.stringify({...o,exp:Date.now()+10*60_000,nonce:crypto.randomUUID()}));return `${payload}.${await hmac(payload)}`}
async function stateRead(s:string){const [p,sig]=String(s||'').split('.');if(!p||!sig||await hmac(p)!==sig)throw new Error('Ungültiger Bank-State');const pad='='.repeat((4-p.length%4)%4),obj=JSON.parse(atob((p+pad).replaceAll('-','+').replaceAll('_','/')));if(obj.exp<Date.now())throw new Error('Bank-State abgelaufen');return obj}
async function currentUser(req:Request){const auth=req.headers.get('Authorization')||'';const client=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('Nicht angemeldet');return data.user}
async function member(userId:string,householdId:string){const {data}=await admin.from('household_members').select('role').eq('household_id',householdId).eq('user_id',userId).maybeSingle();if(!data)throw new Error('Kein Zugriff auf diesen Haushalt');return data.role}
function normBank(t:any){const rawAmount=Number(t.transaction_amount?.amount??t.amount??0),indicator=String(t.credit_debit_indicator??t.creditDebitIndicator??'').toUpperCase(),direction=indicator==='DBIT'?'debit':indicator==='CRDT'?'credit':rawAmount<0?'debit':'credit',btc=t.bank_transaction_code,title=Array.isArray(t.remittance_information)&&t.remittance_information[0]?String(t.remittance_information[0]):String(btc?.description||btc?.code||t.creditor?.name||t.debtor?.name||'N26 Umsatz');return{id:String(t.entry_reference||t.transaction_id||t.reference||crypto.randomUUID()),date:String(t.booking_date||t.transaction_date||t.value_date||t.date||'').slice(0,10),amount:Math.abs(rawAmount),direction,merchant:t.creditor?.name||t.debtor?.name||t.merchant_name||'',title,remittance:Array.isArray(t.remittance_information)?t.remittance_information.join(' · '):String(t.remittance_information||''),reference:String(t.entry_reference||t.transaction_id||t.reference_number||'')}}

Deno.serve(async(req)=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  try{
    const user=await currentUser(req),url=new URL(req.url),marker='/finanzplan-api',path=url.pathname.includes(marker)?url.pathname.slice(url.pathname.indexOf(marker)+marker.length)||'/':url.pathname;

    if(path==='/health')return json({ok:true,service:'finanzplan-api',bankingConfigured:!!(Deno.env.get('ENABLE_BANKING_APP_ID')&&Deno.env.get('ENABLE_BANKING_PRIVATE_KEY')),aiConfigured:!!Deno.env.get('OPENAI_API_KEY'),pushConfigured:true,secretsExternalized:true},200,origin);
    if(path==='/api/banking/status')return json({provider:'Enable Banking',bank:'N26',configured:!!(Deno.env.get('ENABLE_BANKING_APP_ID')&&Deno.env.get('ENABLE_BANKING_PRIVATE_KEY'))},200,origin);

    if(path==='/api/banking/n26/start'&&req.method==='POST'){
      const b=await req.json(),hid=String(b.householdId||'');await member(user.id,hid);
      const list=await eb('/aspsps?country=DE'),arr=list.aspsps||list||[],n26=arr.find((x:any)=>/n26/i.test(`${x.name||''} ${x.id||''}`));
      if(!n26)throw new Error('N26 DE wurde beim PSD2-Provider nicht gefunden');
      const state=await stateMake({userId:user.id,householdId:hid,redirectUrl:String(b.redirectUrl||''),aspspName:n26.name||'N26'}),valid=new Date(Date.now()+90*86400_000).toISOString();
      const auth=await eb('/auth',{method:'POST',body:JSON.stringify({access:{valid_until:valid,balances:true,transactions:true},aspsp:{name:n26.name,country:'DE'},state,redirect_url:String(b.redirectUrl||''),psu_id:String(b.psuId||user.id)})});
      return json({url:auth.url||auth.authorization_url,state},200,origin);
    }

    if(path==='/api/banking/n26/exchange'&&req.method==='POST'){
      const b=await req.json(),st=await stateRead(b.state);if(st.userId!==user.id)throw new Error('Bank-State gehört zu anderem Benutzer');await member(user.id,st.householdId);
      const sess=await eb('/sessions',{method:'POST',body:JSON.stringify({code:b.code})}),sid=sess.session_id||sess.id;if(!sid)throw new Error('Keine Enable-Banking Session erhalten');
      const accounts=sess.accounts||[];
      await admin.from('bank_sessions').upsert({user_id:user.id,household_id:st.householdId,provider:'enablebanking',bank:'N26',session_id:sid,accounts,authorized_at:new Date().toISOString(),valid_until:sess.valid_until||sess.access?.valid_until||null,updated_at:new Date().toISOString()},{onConflict:'user_id,household_id,provider'});
      return json({accounts},200,origin);
    }

    if(path==='/api/banking/n26/sync'){
      const hid=url.searchParams.get('householdId')||'',days=Math.max(1,Math.min(730,Number(url.searchParams.get('days')||180)));await member(user.id,hid);
      const {data:s}=await admin.from('bank_sessions').select('*').eq('user_id',user.id).eq('household_id',hid).eq('provider','enablebanking').maybeSingle();if(!s)throw new Error('N26 ist noch nicht verbunden');
      const accounts=Array.isArray(s.accounts)?s.accounts:[],aid=accounts[0]?.uid||accounts[0]?.account_id||accounts[0]?.id;if(!aid)throw new Error('Kein N26 Konto in der PSD2-Session');
      const from=new Date(Date.now()-days*86400_000).toISOString().slice(0,10),to=new Date().toISOString().slice(0,10);let txs:any[]=[],cont='';
      for(let i=0;i<20;i++){const q=new URLSearchParams({date_from:from,date_to:to,strategy:'longest'});if(cont)q.set('continuation_key',cont);const j=await eb(`/accounts/${encodeURIComponent(aid)}/transactions?${q}`);txs.push(...(j.transactions||[]));cont=j.continuation_key||'';if(!cont)break}
      const bal=await eb(`/accounts/${encodeURIComponent(aid)}/balances`),balances=bal.balances||bal||[],preferred=balances.find((x:any)=>/CLAV|CLBD|closing|interimAvailable|expected/i.test(String(x.balance_type||x.type||'')))||balances[0],balance=Number(preferred?.balance_amount?.amount??preferred?.amount??NaN);
      return json({transactions:txs.map(normBank),balance:Number.isFinite(balance)?balance:null,account:accounts[0]},200,origin);
    }

    if(path==='/api/ai/analyze'&&req.method==='POST'){
      const key=Deno.env.get('OPENAI_API_KEY');if(!key)throw new Error('Cloud-KI ist nicht konfiguriert; lokaler KI-Modus bleibt verfügbar');
      const b=await req.json(),context=b.context||{},question=String(b.question||''),model=Deno.env.get('OPENAI_MODEL')||'gpt-5-mini';
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:'Antworte auf Deutsch als vorsichtiger persönlicher Finanz-Erklärer. Alle Zahlen im bereitgestellten JSON sind autoritativ. Erfinde keine Kontostände und rechne sie nicht anders. Keine Renditegarantien.',input:`Frage: ${question}\nFinanzdaten: ${JSON.stringify(context).slice(0,60000)}`})}),j=await r.json();
      if(!r.ok)throw new Error(j.error?.message||`OpenAI ${r.status}`);
      const text=j.output_text||j.output?.flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||'').join('')||'';
      return json({text},200,origin);
    }

    if(path==='/api/push/public-key')return json({publicKey:VAPID_PUBLIC},200,origin);
    if(path==='/api/push/subscribe'&&req.method==='POST'){
      const b=await req.json(),hid=String(b.householdId||'');await member(user.id,hid);const sub=b.subscription;if(!sub?.endpoint)throw new Error('Push-Subscription fehlt');
      await admin.from('push_subscriptions').upsert({user_id:user.id,household_id:hid,endpoint:sub.endpoint,subscription:sub,device_name:String(b.deviceName||''),updated_at:new Date().toISOString()},{onConflict:'endpoint'});
      return json({ok:true},200,origin);
    }
    if(path==='/api/push/test'&&req.method==='POST'){
      await ensurePush();const b=await req.json().catch(()=>({})),hid=String(b.householdId||'');if(hid)await member(user.id,hid);let q=admin.from('push_subscriptions').select('*').eq('user_id',user.id);if(hid)q=q.eq('household_id',hid);const {data:subs}=await q;let sent=0;
      for(const s of subs||[]){try{await webpush.sendNotification(s.subscription,JSON.stringify({title:'Finanzplan',body:'Server-Push funktioniert.',tag:'finanzplan-test',url:APP_ORIGIN+'/'}));sent++}catch(e:any){if(e?.statusCode===404||e?.statusCode===410)await admin.from('push_subscriptions').delete().eq('id',s.id)}}
      return json({sent},200,origin);
    }
    return json({error:'Not found'},404,origin);
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},400,origin)}
});
