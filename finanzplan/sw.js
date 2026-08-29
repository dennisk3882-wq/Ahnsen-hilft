const CACHE='finanzplan-v3.0.0';
const CORE=['./','./index.html','./styles.css','./styles-v2.css','./app-preload.js','./finance-lib.js','./app-core.js','./app-dashboard.js','./app-transactions.js','./app-recurring.js','./app-budgetwealth.js','./app-contractsgoals.js','./app-analytics.js','./app-moreui.js','./app-modal.js','./app-forms-a.js','./app-forms-b1.js','./app-forms-b2.js','./app-tools-small.js','./app-files-a.js','./app-files-b.js','./app-export.js','./app-v2-engine.js','./app-v2-ui.js','./app-v2-dataio.js','./app-security.js','./app-v2-security.js','./app-projectreset.js','./app-v2-history.js','./app-v2-fixes.js','./app-v2-post.js','./app-v2-edge.js','./app-v2-22-accounting.js','./app-v2-22-ui.js','./app-v2-22-safety.js','./app-v2-22-meta.js','./app-v2-22-patch.js','./app-v2-22-final.js','./app-v2-22-reservefix.js','./app-v2-22-bootstrap.js','./v3/bootstrap.js','./v3/storage.js','./v3/money.js','./v3/backup.js','./v3/pwa.js','./v3/diagnostics.js','./v3/runtime.js','./manifest.webmanifest','./icon.svg','./icon-maskable.svg'];
const CORE_PATHS=new Set(CORE.map(x=>new URL(x,self.registration.scope).pathname));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  // External APIs, sync endpoints, PSD2 and future AI calls are always network-only.
  if(url.origin!==self.location.origin){e.respondWith(fetch(req));return}
  if(req.mode==='navigate'){
    e.respondWith(fetch(req,{cache:'no-store'}).then(r=>{if(r?.ok)caches.open(CACHE).then(c=>c.put('./index.html',r.clone()));return r}).catch(()=>caches.match('./index.html')));return
  }
  // Cache only explicit static application assets. Same-origin API/data endpoints are never cached.
  if(!CORE_PATHS.has(url.pathname)){e.respondWith(fetch(req));return}
  e.respondWith(caches.match(req).then(cached=>{
    const fresh=fetch(req).then(r=>{if(r?.ok)caches.open(CACHE).then(c=>c.put(req,r.clone()));return r}).catch(()=>cached);
    return cached||fresh;
  }));
});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification?.data?.url||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('navigate'in c)c.navigate(url);if('focus'in c)return c.focus()}return clients.openWindow(url)}))});
self.addEventListener('message',e=>{if(e.data?.type==='SHOW_NOTIFICATION')self.registration.showNotification(e.data.title||'Finanzplan',{body:e.data.body||'',icon:'./icon.svg',badge:'./icon-maskable.svg',data:{url:e.data.url||'./'}})});
self.addEventListener('push',e=>{let payload={};try{payload=e.data?.json?.()||{}}catch(_){payload={body:e.data?.text?.()||''}}const title=payload.title||'Finanzplan',options={body:payload.body||'Neue Finanzplan-Benachrichtigung',icon:'./icon.svg',badge:'./icon-maskable.svg',tag:payload.tag||'finanzplan',renotify:!!payload.renotify,data:{url:payload.url||'./'}};e.waitUntil(self.registration.showNotification(title,options))});
