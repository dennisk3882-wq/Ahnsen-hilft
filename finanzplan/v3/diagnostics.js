'use strict';
(function(){
  const esc=v=>escapeHTML(String(v??''));
  const humanBytes=n=>{n=Number(n)||0;if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;if(n<1073741824)return`${(n/1048576).toFixed(1)} MB`;return`${(n/1073741824).toFixed(1)} GB`};
  async function fetchHeaders(){try{let r=await fetch(location.href,{method:'HEAD',cache:'no-store',credentials:'same-origin'});if(!r.ok)r=await fetch(location.href,{cache:'no-store',credentials:'same-origin'});const keys=['content-security-policy','strict-transport-security','x-frame-options','x-content-type-options','referrer-policy','permissions-policy','cross-origin-opener-policy'];return{ok:r.ok,status:r.status,headers:Object.fromEntries(keys.map(k=>[k,r.headers.get(k)||'']))}}catch(e){return{ok:false,status:0,error:e.message,headers:{}}}}
  async function runDiagnostics(){
    const [storage,headers]=await Promise.all([window.__finanzplanStorage?.estimate?.().catch(()=>({usage:0,quota:0,persisted:false}))||{},fetchHeaders()]),issues=typeof integrityReport==='function'?integrityReport():[],reg=await navigator.serviceWorker?.getRegistration?.(),state=await window.__finanzplanStorage?.loadState?.().catch(()=>null),expectedHeaders=['content-security-policy','strict-transport-security','x-frame-options','x-content-type-options','referrer-policy','permissions-policy'],missing=expectedHeaders.filter(k=>!headers.headers?.[k]),tx=data.transactions||[],centCoverage=tx.length?Math.round(tx.filter(t=>Number.isInteger(t.amountCents)).length/tx.length*100):100;
    return{version:data.version||'?',schema:data.schemaVersion||'?',indexedDb:!!state,storage,headers,missingHeaders:missing,serviceWorker:!!reg,serviceWorkerState:reg?.active?.state||reg?.installing?.state||reg?.waiting?.state||'—',standalone:FinanzPWA?.isStandalone?.()||false,installable:!!FinanzPWA?.getInstallPrompt?.(),integrity:issues,centCoverage,timeFresh:localISO(new Date())===localISO(now),online:navigator.onLine,secure:window.isSecureContext,docs:(data.documents||[]).length,transactions:tx.length}
  }
  const badge=(ok,yes='OK',no='Prüfen')=>`<span class="tag ${ok?'green':'orange'}">${ok?yes:no}</span>`;
  async function openDiagnostics(){openModal('Systemdiagnose V3','Live-Prüfung des aktuell geöffneten Finanzplans.',`<div class="empty">Systemprüfung läuft…</div>`,async()=>{
    const result=await runDiagnostics(),headerText=result.missingHeaders.length?`Fehlen im HTTP-Response: ${result.missingHeaders.join(', ')}`:'Alle erwarteten Security-Header im Live-Response erkannt.';
    $('#modalBody').innerHTML=`<div class="three"><div class="kpi-small"><small>Version</small><strong>${esc(result.version)}</strong></div><div class="kpi-small"><small>Datenbank</small><strong>${result.indexedDb?'IndexedDB V3':'Fallback'}</strong></div><div class="kpi-small"><small>Cent-Abdeckung</small><strong>${result.centCoverage}%</strong></div></div>
    <div class="simple-list" style="margin-top:14px">
      <div class="list-row"><div><strong>Datenintegrität</strong><small>${result.integrity.length?result.integrity.map(x=>esc(x.text)).slice(0,3).join(' · '):'Keine bekannten Inkonsistenzen'}</small></div>${badge(!result.integrity.length)}</div>
      <div class="list-row"><div><strong>Aktuelles Datum</strong><small>${esc(localISO(new Date()))}</small></div>${badge(result.timeFresh)}</div>
      <div class="list-row"><div><strong>Service Worker</strong><small>${esc(result.serviceWorkerState)}</small></div>${badge(result.serviceWorker)}</div>
      <div class="list-row"><div><strong>Sicherer Kontext</strong><small>HTTPS / WebCrypto / WebAuthn Voraussetzung</small></div>${badge(result.secure)}</div>
      <div class="list-row"><div><strong>Render Security-Header</strong><small>${esc(headerText)}</small></div>${badge(result.headers.ok&&!result.missingHeaders.length)}</div>
      <div class="list-row"><div><strong>PWA-Modus</strong><small>${result.standalone?'Installierte App':'Browser/Webseite'} · Installprompt ${result.installable?'verfügbar':'browserabhängig'}</small></div>${badge(true)}</div>
      <div class="list-row"><div><strong>Speicher</strong><small>${humanBytes(result.storage.usage)} von ${humanBytes(result.storage.quota)} verwendet · ${result.storage.persisted?'dauerhaft geschützt':'Browser darf Speicher bei Platzmangel bereinigen'}</small></div>${badge(result.storage.persisted,'Persistent','Optimierbar')}</div>
      <div class="list-row"><div><strong>Datenmenge</strong><small>${result.transactions} Buchungen · ${result.docs} Belege</small></div>${badge(true)}</div>
    </div>
    <div class="insight"><div class="insight-icon">i</div><div><b>Externe Komponenten</b><p>Multiuser-Backend, serverseitiger Web-Push, PSD2-Provider und freie generative KI bleiben separate externe Dienste und werden hier bewusst nicht als lokale PWA-Funktion ausgegeben.</p></div></div>
    <div class="modal-actions"><button id="requestPersistentStorage" class="secondary-button">Speicher dauerhaft schützen</button><button id="rerunDiagnostics" class="secondary-button">Neu prüfen</button><button class="primary-button" data-cancel>Schließen</button></div>`;
    $('#requestPersistentStorage').onclick=async()=>{try{const ok=await navigator.storage?.persist?.();toast(ok?'Dauerhafter Speicher wurde gewährt':'Browser hat dauerhaften Speicher nicht gewährt',ok?'success':'error')}catch(e){toast(e.message,'error')}};$('#rerunDiagnostics').onclick=openDiagnostics;$('[data-cancel]').onclick=closeModal;
  })}
  const baseRenderMore=renderMore;renderMore=function(){baseRenderMore();const root=$('#view-more'),grid=$('.more-grid',root);if(grid&&!$('#v3DiagnosticsTile',root)){const b=document.createElement('button');b.id='v3DiagnosticsTile';b.className='more-tile';b.innerHTML='<span>✓</span><b>Systemdiagnose</b><small>Live-Check von Daten, PWA, Render und Sicherheit</small>';b.onclick=openDiagnostics;grid.prepend(b)}};
  globalThis.FinanzDiagnostics={runDiagnostics,openDiagnostics};
})();
