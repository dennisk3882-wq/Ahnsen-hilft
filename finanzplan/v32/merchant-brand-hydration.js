'use strict';
(function(){
  const api=window.FinanzBrand;if(!api)return;
  const waitForNode=async node=>{
    for(let i=0;i<120&&node?.dataset?.brandLoading==='1';i++)await new Promise(r=>setTimeout(r,10));
    return node?.dataset?.brandReady==='1';
  };
  api.hydrate=async function(root=document){
    const nodes=[...(root.querySelectorAll?.('[data-brand-slug]')||[])];
    await Promise.all(nodes.map(async node=>{
      if(node.dataset.brandReady==='1')return true;
      if(node.dataset.brandLoading==='1')return waitForNode(node);
      const result=await api.setLogo(node,api.brandFor(node.dataset.brandMerchant||''));
      if(result)return true;
      if(node.dataset.brandLoading==='1')return waitForNode(node);
      return node.dataset.brandReady==='1';
    }));
  };
  api.hydrationVersion='1.0.0';
})();
