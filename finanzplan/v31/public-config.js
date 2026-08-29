'use strict';
(function(){
  const PUBLIC_SUPABASE_URL='https://yhsuuoexxjejboqbrvuk.supabase.co';
  const PUBLIC_SUPABASE_KEY='sb_publishable_e4LMvDTTT41I3fAKZjjjJw_zVTLcTRy';
  const PUBLIC_BACKEND_URL='https://yhsuuoexxjejboqbrvuk.supabase.co/functions/v1/finanzplan-api';
  function applyPublicConfig(target=data){
    target.integrations=target.integrations||{};
    target.integrations.cloud=target.integrations.cloud||{};
    target.integrations.n26=target.integrations.n26||{};
    target.integrations.ai=target.integrations.ai||{};
    if(!target.integrations.cloud.url)target.integrations.cloud.url=PUBLIC_SUPABASE_URL;
    if(!target.integrations.cloud.publishableKey)target.integrations.cloud.publishableKey=PUBLIC_SUPABASE_KEY;
    if(!target.integrations.backendUrl)target.integrations.backendUrl=PUBLIC_BACKEND_URL;
    if(!target.integrations.n26.backendUrl)target.integrations.n26.backendUrl=target.integrations.backendUrl||PUBLIC_BACKEND_URL;
    if(!target.integrations.ai.backendUrl)target.integrations.ai.backendUrl=target.integrations.backendUrl||PUBLIC_BACKEND_URL;
    return target;
  }
  applyPublicConfig();
  const baseSave=saveData;
  saveData=function(reason='Änderung gespeichert'){applyPublicConfig(data);return baseSave(reason)};
  if(typeof emptyProjectData==='function'){
    const baseEmpty=emptyProjectData;
    emptyProjectData=function(preservePreferences=true){return applyPublicConfig(baseEmpty(preservePreferences))};
  }
  window.FinanzPublicConfig=Object.freeze({supabaseUrl:PUBLIC_SUPABASE_URL,supabasePublishableKey:PUBLIC_SUPABASE_KEY,backendUrl:PUBLIC_BACKEND_URL,apply:applyPublicConfig});
})();
