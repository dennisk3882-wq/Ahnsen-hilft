'use strict';
(function(){
  const PUBLIC_SUPABASE_URL='https://yhsuuoexxjejboqbrvuk.supabase.co';
  const PUBLIC_SUPABASE_KEY='sb_publishable_e4LMvDTTT41I3fAKZjjjJw_zVTLcTRy';
  const PUBLIC_BACKEND_URL='https://yhsuuoexxjejboqbrvuk.supabase.co/functions/v1/finanzplan-api';
  data.integrations=data.integrations||{};
  data.integrations.cloud=data.integrations.cloud||{};
  data.integrations.n26=data.integrations.n26||{};
  data.integrations.ai=data.integrations.ai||{};
  if(!data.integrations.cloud.url)data.integrations.cloud.url=PUBLIC_SUPABASE_URL;
  if(!data.integrations.cloud.publishableKey)data.integrations.cloud.publishableKey=PUBLIC_SUPABASE_KEY;
  if(!data.integrations.backendUrl)data.integrations.backendUrl=PUBLIC_BACKEND_URL;
  if(!data.integrations.n26.backendUrl)data.integrations.n26.backendUrl=PUBLIC_BACKEND_URL;
  if(!data.integrations.ai.backendUrl)data.integrations.ai.backendUrl=PUBLIC_BACKEND_URL;
  window.FinanzPublicConfig=Object.freeze({supabaseUrl:PUBLIC_SUPABASE_URL,supabasePublishableKey:PUBLIC_SUPABASE_KEY,backendUrl:PUBLIC_BACKEND_URL});
})();
