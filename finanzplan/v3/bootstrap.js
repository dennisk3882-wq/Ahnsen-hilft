import {V3Storage} from './storage.js';

window.__v3BootManaged=true;
window.__finanzplanStorage=V3Storage;
const vaultExists=()=>!!localStorage.getItem('finanzplan:vault:v2');
const boot=await V3Storage.loadOrMigrate();
window.__finanzplanBootState=boot.state;
window.__finanzplanFirstRun=!boot.state&&!vaultExists();
if(window.__finanzplanFirstRun)sessionStorage.setItem('finanzplan:first-run','1');else sessionStorage.removeItem('finanzplan:first-run');
if(boot.migrated&&!vaultExists())localStorage.removeItem('finanzplan:data:v1');

const nativeGetItem=Storage.prototype.getItem;
let bootBridge=!!boot.state&&!vaultExists();
if(bootBridge){const serialized=JSON.stringify(boot.state);Storage.prototype.getItem=function(key){if(this===localStorage&&key==='finanzplan:data:v1')return serialized;return nativeGetItem.call(this,key)}}
function closeBootBridge(){if(bootBridge){Storage.prototype.getItem=nativeGetItem;bootBridge=false}}

const scripts=[
  './app-preload.js','./finance-lib.js','./app-core.js','./app-dashboard.js','./app-transactions.js','./app-recurring.js','./app-budgetwealth.js','./app-contractsgoals.js','./app-analytics.js','./app-moreui.js','./app-modal.js','./app-forms-a.js','./app-forms-b1.js','./app-forms-b2.js','./app-tools-small.js','./app-files-a.js','./app-files-b.js','./app-export.js','./app-v2-engine.js','./app-v2-ui.js','./app-v2-dataio.js','./app-security.js','./app-v2-security.js','./app-projectreset.js','./app-v2-history.js','./app-v2-fixes.js','./app-v2-post.js','./app-v2-edge.js','./app-v2-22-accounting.js','./app-v2-22-ui.js','./app-v2-22-safety.js','./app-v2-22-meta.js','./app-v2-22-patch.js','./app-v2-22-final.js','./app-v2-22-reservefix.js','./app-v2-22-bootstrap.js',
  './v3/money.js','./v3/backup.js','./v3/pwa.js','./v3/diagnostics.js','./v3/meta.js','./v3/runtime.js',
  './v31/premium.js','./v31/fixes.js','./v31/importers.js','./v31/public-config.js','./v31/cloud.js','./v31/cloud-concurrency.js','./v31/cloud-documents.js','./v31/ai.js','./v31/passkey.js','./v31/banking.js','./v31/push.js','./v31/ui.js','./v31/integrations-ui.js','./v31/status.js','./v31/runtime.js',
  './v32/intelligence.js','./v32/category-intelligence.js','./v32/category-learning.js','./v32/merchant-brand.js','./v32/banking-hub.js','./v32/ai-plus.js','./v32/e2ee.js','./v32/e2ee-guard.js','./v32/monitoring.js','./v32/onboarding.js','./v32/status.js','./v32/runtime.js'
];
function loadClassic(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error(`Script konnte nicht geladen werden: ${src}`));document.body.appendChild(s)})}
try{for(const src of scripts){await loadClassic(src);if(src.endsWith('/app-core.js'))closeBootBridge();if(src.endsWith('/app-security.js')){window.__finanzplanLegacyInit=window.init;window.init=()=>{window.__v3InitRequested=true}}}closeBootBridge();if(!vaultExists())localStorage.removeItem('finanzplan:data:v1');if(typeof window.finanzplanV3Start!=='function')throw new Error('V3.2 runtime fehlt');await window.finanzplanV3Start({bootState:boot.state,migrated:boot.migrated})}catch(err){closeBootBridge();console.error('Finanzplan V3.2 bootstrap failed',err);const host=document.getElementById('toastHost');if(host){const el=document.createElement('div');el.className='toast error';el.textContent=`Finanzplan konnte nicht vollständig starten: ${err.message}`;host.appendChild(el)}}