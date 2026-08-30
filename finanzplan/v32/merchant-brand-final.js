'use strict';
(function(){
  function brand(){return globalThis.FinanzBrand}
  function hydrate(root){const p=brand()?.hydrate?.(root);if(p?.catch)p.catch(()=>{})}
  function decorateTransactionRows(root){
    if(!root)return;
    $$('[data-edit-tx]',root).forEach(button=>{
      const tx=(data.transactions||[]).find(x=>x.id===button.dataset.editTx),row=button.closest('tr');
      if(!tx||!row||row.querySelector('.merchant-logo'))return;
      const cell=row.cells?.[1];if(!cell)return;
      const shell=document.createElement('div'),copy=document.createElement('div'),host=document.createElement('div');
      shell.className='merchant-cell';copy.className='merchant-brand-copy';host.innerHTML=brand().logoHTML(tx,{size:40});
      while(cell.firstChild)copy.appendChild(cell.firstChild);
      if(host.firstElementChild)shell.appendChild(host.firstElementChild);shell.appendChild(copy);cell.appendChild(shell);
    });
  }
  function decorateListRow(row,item){
    if(!row||!item||row.querySelector('.merchant-logo'))return;
    let icon=row.querySelector(':scope > .list-icon');if(!icon){icon=document.createElement('div');icon.className='list-icon';row.prepend(icon)}
    icon.classList.add('merchant-list-icon');icon.innerHTML=brand().logoHTML({provider:item.provider,title:item.name},{size:38});
  }
  function decorateContractRows(root){
    if(!root)return;
    $$('[data-edit-contract]',root).forEach(button=>decorateListRow(button.closest('.list-row'),(data.contracts||[]).find(x=>x.id===button.dataset.editContract)));
    $$('[data-edit-insurance]',root).forEach(button=>decorateListRow(button.closest('.list-row'),(data.insurances||[]).find(x=>x.id===button.dataset.editInsurance)));
  }
  function rankingHTML(rows){return `<div class="merchant-ranking">${rows.map((x,i)=>`<div class="merchant-rank-row"><span class="merchant-rank-no">${i+1}</span>${brand().logoHTML(x.sample,{size:36})}<div class="merchant-rank-name"><b>${escapeHTML(x.name)}</b><small>${x.count} Buchung${x.count===1?'':'en'}</small></div><div class="merchant-rank-value"><b class="money">${money(x.value)}</b><small>Ausgaben</small></div></div>`).join('')}</div>`}
  function ensureStatsBranding(root){
    if(!root||root.querySelector('.merchant-ranking .merchant-logo'))return;
    const rows=brand()?.topMerchants?.(selectedMonth,8)||[];if(!rows.length)return;
    $('#brandStatsTopMerchants',root)?.remove();root.insertAdjacentHTML('beforeend',`<article id="brandStatsTopMerchants" class="card" style="margin-top:16px"><div class="card-title-row"><div><h2>Top-Händler</h2><p>Wo dein Geld in ${fmtMonth(selectedMonth)} tatsächlich hingegangen ist</p></div></div>${rankingHTML(rows)}</article>`);
  }
  const txBase=window.renderTransactions;
  if(typeof txBase==='function')window.renderTransactions=function(){txBase();const root=$('#view-transactions');decorateTransactionRows(root);hydrate(root)};
  const statsBase=window.renderStats;
  if(typeof statsBase==='function')window.renderStats=function(){statsBase();const root=$('#view-stats');ensureStatsBranding(root);hydrate(root)};
  const contractsBase=window.renderContracts;
  if(typeof contractsBase==='function')window.renderContracts=function(){contractsBase();const root=$('#view-contracts');decorateContractRows(root);hydrate(root)};
  window.FinanzBrandFinal={decorateTransactionRows,decorateContractRows,ensureStatsBranding,version:'1.0.0'};
})();
