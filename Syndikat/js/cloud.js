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
  let realtimeClient=null,realtimeChannel=null,accountClient=null;
  function accountFactory(){
    if(!window.supabase?.createClient)return null;
    if(!accountClient)accountClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'syndikat-auth-v1'}
    });
    return accountClient;
  }
  function realtimeFactory(){
    if(!window.supabase?.createClient)return null;
    if(!realtimeClient)realtimeClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      realtime:{params:{eventsPerSecond:10}}
    });
    return realtimeClient;
  }
  async function rpc(name,{code,token,body}){
    return await req('rpc/'+name,{method:'POST',code,token,body});
  }
  async function edge(name,body,{auth=false}={}){
    if(!api.enabled)throw new Error('Syndikat Cloud ist nicht konfiguriert.');
    const headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
    if(auth){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const {data,error}=await client.auth.getSession();if(error)throw error;
      const access=data?.session?.access_token;if(!access)throw new Error('authentication required');
      headers.Authorization='Bearer '+access;
    }
    const r=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/'+name,{method:'POST',headers,body:JSON.stringify(body||{})});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={error:text}};
    if(!r.ok)throw new Error(data?.error||text||('Edge HTTP '+r.status));
    return data;
  }
  function vapidBytes(key){
    const pad='='.repeat((4-key.length%4)%4),base=(key+pad).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }

  const api={
    enabled:!!(cfg.enabled&&cfg.url&&cfg.publishableKey),
    async createCloudSave(state){
      const code=gameCode(),token=rand(24),owner_token_hash=await hash(token);
      const rows=await req('syndikat_cloud_saves?select=save_code,family,round,revision,game_state,created_at,updated_at',{method:'POST',code,token,prefer:'return=representation',body:{save_code:code,owner_token_hash,family:state?.players?.[state.currentIndex]?.family||state?.players?.[0]?.family||'Syndikat',round:state?.round||1,revision:1,game_state:state}});
      return{code,token,row:rows?.[0]||null};
    },
    async loadCloudSave(code,token){
      const rows=await req('syndikat_cloud_saves?save_code=eq.'+encodeURIComponent(code)+'&select=save_code,family,round,revision,game_state,created_at,updated_at',{code,token});
      return rows?.[0]||null;
    },
    async updateCloudSave(code,token,state,revision){
      const rows=await req('syndikat_cloud_saves?save_code=eq.'+encodeURIComponent(code)+'&revision=eq.'+Number(revision)+'&select=save_code,family,round,revision,game_state,created_at,updated_at',{method:'PATCH',code,token,prefer:'return=representation',body:{family:state?.players?.[state.currentIndex]?.family||'Syndikat',round:state?.round||1,revision:Number(revision)+1,game_state:state}});
      if(!rows?.length)throw new Error('Cloud-Spielstand wurde zwischenzeitlich geändert.');
      return rows[0];
    },
    async createLobby({displayName,family,settings={}}){
      const code=gameCode(),token=rand(24),participantId=crypto.randomUUID(),tokenHash=await hash(token);
      await req('syndikat_online_games',{method:'POST',code,token,body:{game_code:code,host_participant_id:participantId,host_token_hash:tokenHash,active_participant_id:participantId,status:'lobby',revision:1,settings},prefer:'return=minimal'});
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
      const rows=await req('syndikat_online_games?game_code=eq.'+encodeURIComponent(code)+'&select=game_code,host_participant_id,active_participant_id,status,revision,settings,game_state,winner_participant_id,created_at,updated_at',{code,token});return rows?.[0]||null;
    },
    async getPlayers(code,token){
      return await req('syndikat_online_players?game_code=eq.'+encodeURIComponent(code)+'&select=participant_id,game_code,display_name,family,ready,joined_at,last_seen&order=joined_at.asc',{code,token})||[];
    },
    async setReady(session,ready){
      return await req('syndikat_online_players?participant_id=eq.'+encodeURIComponent(session.participantId),{method:'PATCH',code:session.code,token:session.token,body:{ready:!!ready,last_seen:new Date().toISOString()},prefer:'return=representation'});
    },
    async startGame(session,revision,state,firstParticipantId){
      return await rpc('syndikat_start_game',{code:session.code,token:session.token,body:{
        p_game_code:session.code,p_revision:Number(revision),p_game_state:state,p_first_participant_id:firstParticipantId
      }});
    },
    async submitTurn(session,revision,state,nextParticipantId,status='playing',winnerParticipantId=null){
      return await rpc('syndikat_submit_turn',{code:session.code,token:session.token,body:{
        p_game_code:session.code,p_revision:Number(revision),p_game_state:state,
        p_next_participant_id:nextParticipantId||null,p_status:status,p_winner_participant_id:winnerParticipantId||null
      }});
    },
    async updateGame(session,revision,patch){
      if(patch?.game_state&&patch?.status==='playing')return this.submitTurn(session,revision,patch.game_state,patch.active_participant_id,'playing',patch.winner_participant_id||null);
      throw new Error('Direkte Online-Spielstandsänderungen sind serverseitig gesperrt.');
    },
    async deleteOnlineGame(session){
      if(!session?.host)throw new Error('Nur der Host kann die Online-Partie löschen.');
      await req('syndikat_online_games?game_code=eq.'+encodeURIComponent(session.code),{method:'DELETE',code:session.code,token:session.token,prefer:'return=minimal'});
      return true;
    },
    watchGame(session,onSignal){
      const client=realtimeFactory();if(!client)return null;
      if(realtimeChannel){try{client.removeChannel(realtimeChannel)}catch{}realtimeChannel=null;}
      const topic='syndikat-'+session.code;
      realtimeChannel=client.channel(topic,{config:{broadcast:{self:false}}})
        .on('broadcast',{event:'state'},msg=>{try{onSignal?.(msg?.payload||{});}catch{}})
        .subscribe();
      return ()=>{if(realtimeChannel){try{client.removeChannel(realtimeChannel)}catch{}realtimeChannel=null;}};
    },
    async signalGame(session,revision,kind='state'){
      if(!realtimeChannel)return false;
      try{
        const r=await realtimeChannel.send({type:'broadcast',event:'state',payload:{revision:Number(revision)||0,kind,at:Date.now()}});
        return r==='ok'||r==='timed out'||!!r;
      }catch{return false;}
    },
    stopRealtime(){
      if(realtimeClient&&realtimeChannel){try{realtimeClient.removeChannel(realtimeChannel)}catch{}}
      realtimeChannel=null;
    },
    async getAccount(){
      const client=accountFactory();if(!client)return null;
      const {data,error}=await client.auth.getSession();if(error)throw error;
      return data?.session?.user||null;
    },
    async signUpAccount(email,password){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist offline nicht verfügbar.');
      const {data,error}=await client.auth.signUp({email,password});if(error)throw error;return data;
    },
    async signInAccount(email,password){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist offline nicht verfügbar.');
      const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;return data;
    },
    async signOutAccount(){
      const client=accountFactory();if(!client)return;
      const {error}=await client.auth.signOut();if(error)throw error;
    },
    async resetPasswordAccount(email){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const redirectTo=location.origin+location.pathname+'?account-reset=1';
      const {data,error}=await client.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;return data;
    },
    async updatePasswordAccount(password){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const {data,error}=await client.auth.updateUser({password});if(error)throw error;return data;
    },
    async deleteAccount(){
      const data=await edge('syndikat-delete-account',{}, {auth:true});
      try{await accountFactory()?.auth.signOut()}catch{}
      return data;
    },
    async getTurnPushStatus(session){
      if(!session||!('serviceWorker' in navigator)||!('PushManager' in window))return false;
      const reg=await navigator.serviceWorker.ready;return !!(await reg.pushManager.getSubscription());
    },
    async enableTurnPush(session){
      if(!session)throw new Error('Keine Online-Partie aktiv.');
      if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Push-Benachrichtigungen werden auf diesem Gerät nicht unterstützt.');
      const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Benachrichtigungen wurden nicht erlaubt.');
      const key=await edge('syndikat-turn-push',{action:'vapid'});
      const reg=await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidBytes(key.publicKey)});
      await edge('syndikat-turn-push',{action:'subscribe',gameCode:session.code,participantId:session.participantId,token:session.token,subscription:sub.toJSON()});
      return true;
    },
    async disableTurnPush(session){
      if(!session||!('serviceWorker' in navigator))return false;
      const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
      if(!sub)return false;
      try{await edge('syndikat-turn-push',{action:'unsubscribe',gameCode:session.code,participantId:session.participantId,token:session.token,endpoint:sub.endpoint})}catch{}
      await sub.unsubscribe();return true;
    },
    async notifyActiveTurn(session){
      if(!session)return 0;
      const r=await edge('syndikat-turn-push',{action:'notify-active',gameCode:session.code,participantId:session.participantId,token:session.token});
      return Number(r?.sent||0);
    },
    async accountListSaves(){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const {data,error}=await client.rpc('syndikat_account_list_saves');if(error)throw error;return data||[];
    },
    async accountLoadSave(slot){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const {data,error}=await client.rpc('syndikat_account_load_save',{p_slot:Number(slot)});if(error)throw error;return data||null;
    },
    async accountSaveSlot(slot,state,expectedRevision=null){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const {data,error}=await client.rpc('syndikat_account_save_slot',{p_slot:Number(slot),p_game_state:state,p_expected_revision:expectedRevision==null?null:Number(expectedRevision)});if(error)throw error;return data;
    },
    async accountDeleteSave(slot){
      const client=accountFactory();if(!client)throw new Error('Kontofunktion ist nicht verfügbar.');
      const {data,error}=await client.rpc('syndikat_account_delete_save',{p_slot:Number(slot)});if(error)throw error;return !!data;
    },
    hashToken:hash
  };
  window.SyndikatCloud=api;
  window.dispatchEvent(new CustomEvent('syndikat-cloud-ready',{detail:{enabled:api.enabled}}));
})();