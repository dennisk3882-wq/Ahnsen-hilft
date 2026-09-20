// Deterministic legal-action bots, not passive human placeholders.
const fs=require('fs'),vm=require('vm'),Module=require('module');
let harness=fs.readFileSync('Syndikat/tests/regression.cjs','utf8').split('// Start progression.')[0];
harness=harness.replace('powerIndex,rankName,controlledDistricts,netWorth,','doCrime,claimMission,missionProgress,CRIMES,powerIndex,rankName,controlledDistricts,netWorth,');
harness=harness.replace('new Function(src);',"new Function(src);src=src.replace('  function purchaseCost(type){','  window.__economyHelpers={purchaseCost,unlockedTier,districtSlotsFree}; function purchaseCost(type){');").replace('const T=context.__TEST__;','const T=context.__TEST__;Object.assign(T,context.__economyHelpers);');
const driver=`
const outcomes=[];
for(const difficulty of ['easy','normal','hard','boss'])for(const style of ['investment','street','mixed'])for(let seed=1;seed<=5;seed++){
 context.Math.random=seeded(seed*7919+difficulty.length*101);
 const st=mk({ais:3,length:'short',difficulty});let actions=0,turns=0;
 while(!st.gameOver&&turns++<400){
  const p=st.players[st.currentIndex];
  if(p.type==='ai')T.aiTurn(p);
  else if(!p.eliminated&&!p.jailed){
   for(const m of [...p.missions])if(T.missionProgress(p,m).done){T.claimMission(m.id);actions++;}
   for(let k=0;k<2&&p.actionPoints>0;k++){
    const choices=Object.entries(T.BUSINESSES).filter(([id,b])=>b.tier<=T.unlockedTier(p)&&T.purchaseCost(id)<(b.tier>=2?p.clean:p.clean+p.dirty)*.7).sort((a,b)=>b[1].baseIncome/b[1].cost-a[1].baseIncome/a[1].cost);
    const selected=choices.find(([id,b])=>T.DISTRICTS.some(d=>T.districtSlotsFree(d.id)>=b.slotUse));
    if(selected&&(style!=='street'||p.businesses.length<2)){
     const [id,b]=selected,d=T.DISTRICTS.find(d=>T.districtSlotsFree(d.id)>=b.slotUse),before=p.businesses.length;
     T.buyBusiness(id,d.id);if(p.businesses.length>before)actions++;
    }else break;
   }
   if(style!=='investment'&&p.heat<45&&p.actionPoints>0){
    const crime=T.CRIMES.filter(c=>c.ap<=p.actionPoints).sort((a,b)=>a.heat-b.heat)[0];if(crime){T.doCrime(crime.id);actions++;}
   }
  }
  for(const x of st.players)for(const key of ['clean','dirty','debt','heat','actionPoints'])assert(Number.isFinite(x[key]),style+' finite '+key);
  T.processEndOfTurn(p);if(!st.gameOver)T.advanceIndex();
 }
 assert(st.gameOver,'active campaign must finish');assert(actions>0,'human strategy must act');
 outcomes.push({difficulty,style,seed,round:st.round,win:st.winnerId===st.players[0].id,worth:Math.round(T.netWorth(st.players[0])),actions});
}
console.log(JSON.stringify({campaigns:outcomes.length,outcomes},null,2));
`;
vm.runInNewContext(harness+driver,{require:Module.createRequire(__filename),console,process,__dirname,Buffer,setTimeout,clearTimeout,setInterval,clearInterval},{filename:__filename});
