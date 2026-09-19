const {test,expect}=require('@playwright/test');
test.setTimeout(90000);

function gameState(host,guest,idx=0,round=1){
  return {
    version:4,rulesRevision:4,round,currentIndex:idx,startedAt:987654321,
    settings:{difficulty:'normal',length:'short'},log:[],winnerId:null,gameOver:false,
    initialPlayerCount:2,initialHumanCount:2,online:true,
    players:[
      {id:'host-p',name:'E2E Host',family:'Leone',type:'human',onlineParticipantId:host.participantId,clean:10000,dirty:15000,debt:0,heat:0,reputation:0,actionPoints:3,jailed:0,businesses:[],staffRoster:[],propertyIds:[],gear:[]},
      {id:'guest-p',name:'E2E Gast',family:'Moretti',type:'human',onlineParticipantId:guest.participantId,clean:10000,dirty:15000,debt:0,heat:0,reputation:0,actionPoints:3,jailed:0,businesses:[],staffRoster:[],propertyIds:[],gear:[]}
    ]
  };
}

test('two real browser clients: lobby, realtime, reconnect, turns and finish',async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  const host=await a.newPage(),guest=await b.newPage();
  let hs=null;
  try{
    await Promise.all([
      host.goto('http://127.0.0.1:4173/index-source.html',{waitUntil:'domcontentloaded'}),
      guest.goto('http://127.0.0.1:4173/index-source.html',{waitUntil:'domcontentloaded'})
    ]);
    await expect.poll(()=>host.evaluate(()=>!!window.SyndikatCloud?.enabled),{timeout:10000}).toBe(true);
    await expect.poll(()=>guest.evaluate(()=>!!window.SyndikatCloud?.enabled),{timeout:10000}).toBe(true);

    hs=await host.evaluate(()=>SyndikatCloud.createLobby({displayName:'E2E Host',family:'Leone',settings:{difficulty:'normal',length:'short',aiCount:0}}));
    const gs=await guest.evaluate(code=>SyndikatCloud.joinLobby(code,{displayName:'E2E Gast',family:'Moretti'}),hs.code);
    await guest.evaluate(s=>SyndikatCloud.setReady(s,true),gs);
    const roster=await host.evaluate(s=>SyndikatCloud.getPlayers(s.code,s.token),hs);
    expect(roster).toHaveLength(2);

    const st=gameState(hs,gs);
    const started=await host.evaluate(({s,st})=>SyndikatCloud.startGame(s,1,st,s.participantId),{s:hs,st});
    expect(started.status).toBe('playing');
    expect(started.revision).toBe(2);

    await host.evaluate(s=>{window.__hostSignal=null;SyndikatCloud.watchGame(s,p=>window.__hostSignal=p);},hs);
    await guest.evaluate(s=>{window.__e2eSignal=null;SyndikatCloud.watchGame(s,p=>window.__e2eSignal=p);},gs);
    await host.waitForTimeout(1000);
    await expect.poll(async()=>{
      await host.evaluate(s=>SyndikatCloud.signalGame(s,2,'state'),hs);
      await guest.waitForTimeout(350);
      return await guest.evaluate(()=>window.__e2eSignal?.revision||0);
    },{timeout:10000,intervals:[500,700,1000]}).toBe(2);

    const st2=gameState(hs,gs,1,1);
    st2.players[0].clean=12000;st2.players[0].actionPoints=0;
    const afterHost=await host.evaluate(({s,st,next})=>SyndikatCloud.submitTurn(s,2,st,next,'playing',null),{s:hs,st:st2,next:gs.participantId});
    expect(afterHost.revision).toBe(3);
    expect(afterHost.active_participant_id).toBe(gs.participantId);

    await guest.reload({waitUntil:'domcontentloaded'});
    await expect.poll(()=>guest.evaluate(()=>!!window.SyndikatCloud?.enabled),{timeout:10000}).toBe(true);
    const resumed=await guest.evaluate(s=>SyndikatCloud.getGame(s.code,s.token),gs);
    expect(resumed.revision).toBe(3);
    expect(resumed.active_participant_id).toBe(gs.participantId);

    const fin=gameState(hs,gs,1,1);
    fin.players[0].clean=12000;fin.players[0].actionPoints=0;
    fin.players[1].clean=14000;fin.players[1].actionPoints=0;
    fin.gameOver=true;fin.winnerId='guest-p';
    const done=await guest.evaluate(({s,st})=>SyndikatCloud.submitTurn(s,3,st,null,'finished',s.participantId),{s:gs,st:fin});
    expect(done.status).toBe('finished');
    expect(done.winner_participant_id).toBe(gs.participantId);
  }finally{
    if(hs)await host.evaluate(s=>SyndikatCloud.deleteOnlineGame(s).catch(()=>false),hs).catch(()=>{});
    await Promise.all([a.close(),b.close()]);
  }
});