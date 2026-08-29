'use strict';
(function(){
  const previous=window.featureMatrix;
  if(typeof previous==='function')window.featureMatrix=function(){return previous().map(f=>{const x={...f};if(x.n===13)x.note='Vertragsplanung plus automatische Abbuchungserkennung und Kündigungsassistent';if(x.n===18)x.note='Supabase Multiuser mit optionaler clientseitiger E2EE für Finanzdaten/Belege';if(x.n===25)x.note='Autopilot, Anomalien, Dubletten, Händlerlernen und Kategorieprognose';if(x.n===32)x.note='Server-Push plus technisches Produktionsmonitoring';if(x.n===38)x.note='Providerneutraler Banking-Hub; N26-Bridge fertig, externer Enable-Banking-Zugang noch nötig';if(x.n===41)x.note='Tresor, Passkey und optionale Cloud-E2EE';if(x.n===44)x.note='Erweiterter lokaler Analyst; Cloud-KI optional und weiterhin externer Modellzugang';return x})};
  window.FinanzV32Status={version:'3.2.0',roadmap:()=>FinanzV32Onboarding?.roadmap?.()||[]};
})();
