(() => {
  'use strict';
  const cfg=window.SYNDIKAT_CLOUD_CONFIG||{};
  const enc=new TextEncoder();
  const rand=(n=24)=>{
    const a=new Uint8Array(n);crypto.getRandomValues(a);
    return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
  };
  const gameCode=()=>rand(10).toUpperCase();
  const hash=async value=>{
    const buf=await crypto.subtle.digest('SHA-256',enc.encode(value));
    return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
  };
  const baseHeaders=(code,token,extra={})=>({
    apikey:cfg.publishableKey,
    'Content-Type':'application/json',
    'x-syndikat-game':code,
    'x-syndikat-player':token,
    ...extra
  });
  async function req(path,{method='GET',code,token,body,prefer}={}){
    if(!api.enabled)throw new Error('Syndikat Cloud ist nicht konfiguriert.');
    const headers=baseHeaders(code,token,prefer?{Prefer:prefer}:{});
    const r=await fetch(cfg.url.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers,body:body==null?undefined:JSON.stringify(body)});
    const text=await r.text();
    if(!r.ok)throw new Error(text||('Cloud HTTP '+r.status));
    return text?JSON.parse(text):null;
  }
  const api={
    enabled:!!(cfg.enabled&&cfg.url&&cfg.publishableKey),
    async createCloudSave(state){
      const code=gameCode(),token=rand(24),owner_token_hash=await hash(token);
      const rows=await req('syndikat_cloud_saves',{method:'POST',code,token,prefer:'return=representation',body:{save_code:code,owner_token_hash,family:state?.players?.[state.currentIndex]?.family||state?.players?.[0]?.family||'Syndikat',round:state?.round||1,revision:1,game_state:state}});
      return{code,token,row:rows?.[0]||null};
    },
    async loadCloudSave(code,token){
      const rows=await req('syndikat_cloud_saves?save_code=eq.'+encodeURIComponent(code)+'&select=*',{code,token});
      return rows?.[0]||null;
    },
    async updateCloudSave(code,token,state,revision){
      const rows=await req('syndikat_cloud_saves?save_code=eq.'+encodeURIComponent(code)+'&revision=eq.'+Number(revision),{method:'PATCH',code,token,prefer:'return=representation',body:{family:state?.players?.[state.currentIndex]?.family||'Syndikat',round:state?.round||1,revision:Number(revision)+1,game_state:state}});
      if(!rows?.length)throw new Error('Cloud-Spielstand wurde zwischenzeitlich geändert.');
      return rows[0];
    },
    async createLobby({displayName,family,settings={}}){
      const code=gameCode(),token=rand(24),participantId=crypto.randomUUID(),tokenHash=await hash(token);
      await req('syndikat_online_games',{method:'POST',code,token,body:{game_code:code,host_participant_id:participantId,host_token_hash:tokenHash,active_participant_id:participantId,active_token_hash:tokenHash,status:'lobby',revision:1,settings},prefer:'return=minimal'});
      await req('syndikat_online_players',{method:'POST',code,token,body:{participant_id:participantId,game_code:code,player_token_hash:tokenHash,display_name:displayName,family,ready:true},prefer:'return=minimal'});
      return{code,token,participantId,host:true};
    },
    async joinLobby(code,{displayName,family}){
      const token=rand(24),participantId=crypto.randomUUID(),tokenHash=await hash(token);
      const game=await this.getGame(code,token);
      if(!game||game.status!=='lobby')throw new Error('Lobby nicht gefunden oder bereits gestartet.');
      await req('syndikat_online_players',{method:'POST',code,token,body:{participant_id:participantId,game_code:code,player_token_hash:tokenHash,display_name:displayName,family,ready:false},prefer:'return=minimal'});
      return{code,token,participantId,host:false};
    },
    async getGame(code,token){
      const rows=await req('syndikat_online_games?game_code=eq.'+encodeURIComponent(code)+'&select=*',{code,token});return rows?.[0]||null;
    },
    async getPlayers(code,token){
      return await req('syndikat_online_players?game_code=eq.'+encodeURIComponent(code)+'&select=participant_id,display_name,family,ready,joined_at,player_token_hash&order=joined_at.asc',{code,token})||[];
    },
    async setReady(session,ready){
      return await req('syndikat_online_players?participant_id=eq.'+encodeURIComponent(session.participantId),{method:'PATCH',code:session.code,token:session.token,body:{ready:!!ready,last_seen:new Date().toISOString()},prefer:'return=representation'});
    },
    async updateGame(session,revision,patch){
      const rows=await req('syndikat_online_games?game_code=eq.'+encodeURIComponent(session.code)+'&revision=eq.'+Number(revision),{method:'PATCH',code:session.code,token:session.token,body:{...patch,revision:Number(revision)+1},prefer:'return=representation'});
      if(!rows?.length)throw new Error('Online-Partie wurde bereits von einem anderen Zug aktualisiert.');
      return rows[0];
    },
    hashToken:hash
  };
  window.SyndikatCloud=api;
  window.dispatchEvent(new CustomEvent('syndikat-cloud-ready',{detail:{enabled:api.enabled}}));
})();