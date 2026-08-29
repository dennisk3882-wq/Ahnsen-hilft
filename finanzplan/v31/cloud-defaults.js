'use strict';
(function(){
  const SUPABASE_URL='https://yhsuuoexxjejboqbrvuk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_e4LMvDTTT41I3fAKZjjjJw_zVTLcTRy';
  data.integrations=data.integrations||{};
  data.integrations.cloud=data.integrations.cloud||{};
  if(!data.integrations.cloud.url)data.integrations.cloud.url=SUPABASE_URL;
  if(!data.integrations.cloud.publishableKey)data.integrations.cloud.publishableKey=SUPABASE_PUBLISHABLE_KEY;
  window.FinanzCloudDefaults={url:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY};
})();
