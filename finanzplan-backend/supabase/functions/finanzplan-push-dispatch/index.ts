import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Public VAPID key; the private key lives only in private.runtime_secrets.
const VAPID_PUBLIC='BLzgC1_mThT-PDptuY-42_gajqos7Xezgd0CkdF77eRA4gEu5Xhn7WVw1EqQHMho-s-OxzY3EXQiAYOb5AU4h-k';
const db=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false}});
const enc=new TextEncoder();
let dispatchToken='',vapidPrivate='',vapidReady=false;

const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
}});

async function runtimeSecret(name:string){
  const {data,error}=await db.rpc('get_runtime_secret',{p_name:name});
  if(error||!data)throw new Error(`Server-Secret ${name} fehlt`);
  return String(data);
}

function safeEq(a:string,b:string){
  const x=enc.encode(a),y=enc.encode(b);
  if(x.length!==y.length)return false;
  let d=0;
  for(let i=0;i<x.length;i++)d|=x[i]^y[i];
  return d===0;
}

async function authorize(req:Request){
  if(!dispatchToken)dispatchToken=await runtimeSecret('dispatch_token');
  return safeEq(req.headers.get('x-finanzplan-dispatch-token')||'',dispatchToken);
}

async function ensurePush(){
  if(vapidReady)return;
  if(!vapidPrivate)vapidPrivate=await runtimeSecret('vapid_private');
  webpush.setVapidDetails('mailto:finanzplan@localhost',VAPID_PUBLIC,vapidPrivate);
  vapidReady=true;
}

Deno.serve(async req=>{
  try{
    if(req.method!=='POST')return json({error:'POST required'},405);
    if(!await authorize(req))return json({error:'Unauthorized'},401);
    await ensurePush();

    const now=new Date().toISOString();
    const {data:jobs,error}=await db.from('push_jobs')
      .select('*').eq('sent',false).lte('due_at',now)
      .order('due_at',{ascending:true}).limit(100);
    if(error)throw error;

    let sentJobs=0,sentDevices=0,failedDevices=0;
    for(const job of jobs||[]){
      const {data:subs}=await db.from('push_subscriptions').select('*').eq('household_id',job.household_id);
      let ok=0;
      for(const sub of subs||[]){
        try{
          await webpush.sendNotification(sub.subscription,JSON.stringify({
            title:job.title,body:job.body,url:job.url,tag:job.tag||job.source_key
          }));
          ok++;sentDevices++;
        }catch(e:any){
          failedDevices++;
          if(e?.statusCode===404||e?.statusCode===410){
            await db.from('push_subscriptions').delete().eq('id',sub.id);
          }
        }
      }
      if(ok>0||(subs||[]).length===0){
        await db.from('push_jobs').update({sent:true,sent_at:new Date().toISOString()}).eq('id',job.id);
        sentJobs++;
      }
    }
    return json({ok:true,jobs:(jobs||[]).length,sentJobs,sentDevices,failedDevices});
  }catch(e){
    console.error(e);
    return json({error:e instanceof Error?e.message:String(e)},500);
  }
});
