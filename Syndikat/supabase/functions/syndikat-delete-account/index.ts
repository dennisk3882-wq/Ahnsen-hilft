import { createClient } from "npm:@supabase/supabase-js@2";

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
function publishableKey(){
  const modern=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(modern){try{return JSON.parse(modern).default}catch{}}
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"method not allowed"}),{status:405,headers:cors});
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))throw new Error("authentication required");
    const url=Deno.env.get("SUPABASE_URL")||"";
    const userClient=createClient(url,publishableKey(),{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const token=auth.slice(7);
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)throw new Error("invalid session");
    const admin=createClient(url,secretKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
    if(deleteError)throw deleteError;
    return new Response(JSON.stringify({ok:true}),{headers:cors});
  }catch(e){
    return new Response(JSON.stringify({error:String(e?.message||e)}),{status:400,headers:cors});
  }
});