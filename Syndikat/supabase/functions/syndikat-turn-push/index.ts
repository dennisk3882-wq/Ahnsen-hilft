import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
function secretKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{return JSON.parse(modern).default}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const url=Deno.env.get("SUPABASE_URL")||"";
const admin=createClient(url,secretKey(),{auth:{persistSession:false,autoRefreshToken:false}});

async function sha256(v:string){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
}
async function keys(){
  let {data}=await admin.from("syndikat_push_config").select("public_key,private_key").eq("id",1).maybeSingle();
  if(data)return data;
  const k=webpush.generateVAPIDKeys();
  const {data:inserted,error}=await admin.from("syndikat_push_config")
    .upsert({id:1,public_key:k.publicKey,private_key:k.privateKey},{onConflict:"id"})
    .select("public_key,private_key").single();
  if(error)throw error;
  return inserted;
}
async function validParticipant(gameCode:string,participantId:string,token:string){
  const h=await sha256(token||"");
  const {data,error}=await admin.from("syndikat_online_players")
    .select("participant_id").eq("game_code",gameCode).eq("participant_id",participantId).eq("player_token_hash",h).maybeSingle();
  if(error)throw error;
  return !!data;
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"method not allowed"}),{status:405,headers:cors});
  try{
    const body:any=await req.json().catch(()=>({}));
    const action=String(body.action||"");
    if(action==="vapid"){
      const k=await keys();
      return new Response(JSON.stringify({publicKey:k.public_key}),{headers:cors});
    }

    if(action==='dispatch'){
      const {data:job,error}=await admin.from('syndikat_push_jobs').update({status:'processing',updated_at:new Date().toISOString()})
        .eq('id',String(body.jobId||'')).eq('token',String(body.jobToken||'')).eq('status','pending').select().maybeSingle();
      if(error)throw error;
      if(!job)return new Response(JSON.stringify({error:'invalid or already claimed job'}),{status:403,headers:cors});
      const {data:game,error:ge}=await admin.from('syndikat_online_games').select('status,revision,active_participant_id').eq('game_code',job.game_code).single();
      if(ge)throw ge;
      if(game.status!=='playing'||game.revision!==job.revision||game.active_participant_id!==job.participant_id){
        await admin.from('syndikat_push_jobs').update({status:'obsolete'}).eq('id',job.id);
        return new Response(JSON.stringify({ok:true,sent:0,obsolete:true}),{headers:cors});
      }
      const {data:subs,error:se}=await admin.from('syndikat_push_subscriptions').select('id,endpoint,p256dh,auth').eq('game_code',job.game_code).eq('participant_id',job.participant_id);
      if(se)throw se;
      const k=await keys();webpush.setVapidDetails('mailto:noreply@syndikat.game',k.public_key,k.private_key);
      let sent=0,failed=0;
      for(const sub of subs||[]){
        try{
          await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},
            JSON.stringify({title:'Syndikat',body:'Du bist am Zug.',url:'/live/?online='+encodeURIComponent(job.game_code),gameCode:job.game_code,revision:job.revision}),{TTL:3600,urgency:'high',timeout:8000});
          sent++;
        }catch(e:any){
          if([404,410].includes(Number(e?.statusCode)))await admin.from('syndikat_push_subscriptions').delete().eq('id',sub.id);
          else failed++;
        }
      }
      await admin.from('syndikat_push_jobs').update({status:failed?'failed':'sent',updated_at:new Date().toISOString()}).eq('id',job.id);
      return new Response(JSON.stringify({ok:!failed,sent}),{headers:cors});
    }

    const gameCode=String(body.gameCode||"").toUpperCase();
    const participantId=String(body.participantId||"");
    const token=String(body.token||"");
    if(!gameCode||!participantId||!token||!(await validParticipant(gameCode,participantId,token))){
      return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:cors});
    }

    if(action==="subscribe"){
      const s=body.subscription||{};
      if(!s.endpoint||!s.keys?.p256dh||!s.keys?.auth)throw new Error("invalid subscription");
      const endpoint=new URL(String(s.endpoint));
      if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.port||!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','notify.windows.com'].some(h=>endpoint.hostname===h||endpoint.hostname.endsWith('.'+h)))throw new Error('unsupported push endpoint');
      const {error}=await admin.from("syndikat_push_subscriptions").upsert({
        game_code:gameCode,participant_id:participantId,endpoint:String(s.endpoint),
        p256dh:String(s.keys.p256dh),auth:String(s.keys.auth),
        user_agent:String(req.headers.get("user-agent")||"").slice(0,240),updated_at:new Date().toISOString()
      },{onConflict:"game_code,participant_id,endpoint"});
      if(error)throw error;
      return new Response(JSON.stringify({ok:true}),{headers:cors});
    }

    if(action==="unsubscribe"){
      const endpoint=String(body.endpoint||"");
      if(endpoint){
        const {error}=await admin.from("syndikat_push_subscriptions").delete()
          .eq("game_code",gameCode).eq("participant_id",participantId).eq("endpoint",endpoint);
        if(error)throw error;
      }
      return new Response(JSON.stringify({ok:true}),{headers:cors});
    }

    if(action==='status'){
      const {data,error}=await admin.from('syndikat_push_subscriptions').select('id').eq('game_code',gameCode).eq('participant_id',participantId).eq('endpoint',String(body.endpoint||'')).maybeSingle();
      if(error)throw error;
      return new Response(JSON.stringify({subscribed:!!data}),{headers:cors});
    }
    // Older clients may still call this. Only committed server transitions enqueue pushes.
    if(action==='notify-active')return new Response(JSON.stringify({ok:true,sent:0,serverManaged:true}),{headers:cors});
    return new Response(JSON.stringify({error:"unknown action"}),{status:400,headers:cors});
  }catch(e){
    return new Response(JSON.stringify({error:String(e?.message||e)}),{status:400,headers:cors});
  }
});