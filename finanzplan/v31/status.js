'use strict';
(function(){
  const previous=featureMatrix;
  featureMatrix=function(){return previous().map(f=>{
    const x={...f};
    if(x.n===10){x.note='Cashflow + konservatives/Basis/optimistisches Prognoseband'}
    if(x.n===18){x.status='complete';x.note='Supabase Auth, Haushalte, Rollen, RLS, Einladungen, Datensatz-Sync, Konflikte und Belege'}
    if(x.n===25){x.note='Preisänderungen, Anomalien, Dubletten und Autopilot-Hinweise'}
    if(x.n===32){x.status='complete';x.note='Web Push, Geräte-Subscription, Supabase Edge Dispatcher und 5-Minuten-Cron'}
    if(x.n===37){x.status='complete';x.note='CSV/XLS/XLSX/XML plus QIF, OFX, MT940 und CAMT.053'}
    if(x.n===38){x.status='partial';x.note='N26/Enable-Banking-Bridge und Consent-Flow fertig; Provider-App-Zugang + N26-Freigabe noch extern nötig'}
    if(x.n===39){x.note='CSV/XLS/PDF/JSON + verschlüsseltes binäres Vollbackup mit Belegen'}
    if(x.n===41){x.status='complete';x.note='AES-GCM-Tresor, Memory-Lock, WebAuthn und PRF-Cold-Start-Passkey wo vom Gerät unterstützt'}
    if(x.n===44){x.status='partial';x.note='Lokaler Analyst immer verfügbar, Geräte-KI optional; freie Cloud-KI benötigt optionalen API-Key'}
    if(x.n===45){x.note='Safe-to-Spend, Tagesbudget, Reichweite und Prognoseband'}
    return x
  })};
  window.FinanzV31Status={version:'3.1.0',complete:43,partial:2,missing:0};
})();
