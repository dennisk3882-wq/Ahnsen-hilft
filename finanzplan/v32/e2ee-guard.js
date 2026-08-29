'use strict';
(function(){
  const baseFullSync=FinanzCloud.fullSync.bind(FinanzCloud),baseSelect=FinanzCloud.selectHousehold?.bind(FinanzCloud);
  function resetFor(id){const c=FinanzE2EE.cfg();if(c._householdId!==id){FinanzE2EE.lock();Object.assign(c,{enabled:false,salt:'',iterations:310000,check:null,_householdId:id||''})}return c}
  async function discover(){const id=FinanzCloud.cloud().householdId;if(!id)return null;const c=resetFor(id),remote=await FinanzE2EE.fetchConfig();c._householdId=id;return remote||c}
  FinanzCloud.fullSync=async function(...args){const c=await discover();if(c?.enabled&&!FinanzE2EE.unlocked())throw new Error('Dieser Cloud-Haushalt ist Ende-zu-Ende verschlüsselt. Bitte zuerst die Haushalts-Passphrase unter Einstellungen → V3.2 → Cloud-E2EE eingeben.');return baseFullSync(...args)};
  if(baseSelect)FinanzCloud.selectHousehold=async function(id){const r=await baseSelect(id);resetFor(id);try{const c=await discover();if(c?.enabled&&!FinanzE2EE.unlocked())toast('Cloud-Haushalt ist E2EE-geschützt – bitte Passphrase eingeben','warning')}catch(e){console.warn('E2EE discovery',e)}return r};
  window.FinanzE2EEGuard={discover,resetFor};
})();
