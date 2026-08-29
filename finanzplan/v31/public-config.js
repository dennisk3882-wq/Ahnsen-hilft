'use strict';
(function(){
  const PUBLIC_SUPABASE_URL='https://yhsuuoexxjejboqbrvuk.supabase.co';
  const PUBLIC_SUPABASE_KEY='sb_publishable_e4LMvDTTT41I3fAKZjjjJw_zVTLcTRy';
  data.integrations=data.integrations||{};
  data.integrations.cloud=data.integrations.cloud||{};
  if(!data.integrations.cloud.url)data.integrations.cloud.url=PUBLIC_SUPABASE_URL;
  if(!data.integrations.cloud.publishableKey)data.integrations.cloud.publishableKey=PUBLIC_SUPABASE_KEY;
  window.FinanzPublicConfig=Object.freeze({supabaseUrl:PUBLIC_SUPABASE_URL,supabasePublishableKey:PUBLIC_SUPABASE_KEY});
})();
